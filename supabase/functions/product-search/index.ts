import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno&no-check";
import { corsHeaders } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
const openAiApiKey = Deno.env.get("OPENAI_API_KEY");
const openAiEmbeddingsUrl = Deno.env.get("OPENAI_EMBEDDINGS_URL") ?? "https://api.openai.com/v1/embeddings";
const embeddingModel = Deno.env.get("EMBEDDING_MODEL") ?? "text-embedding-3-small";
const embeddingDimensions = Number.parseInt(Deno.env.get("EMBEDDING_DIMENSIONS") ?? "", 10);
const expectedEmbeddingLength =
  Number.isFinite(embeddingDimensions) && embeddingDimensions > 0
    ? embeddingDimensions
    : 1536;

async function createEmbedding(input: string): Promise<number[] | null> {
  if (!openAiApiKey) {
    return null;
  }

  const body = JSON.stringify({
    model: embeddingModel,
    input,
  });

  const response = await fetch(openAiEmbeddingsUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openAiApiKey}`,
    },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("OpenAI embeddings request failed", response.status, errorText);
    return null;
  }

  const payload = await response.json() as { data?: { embedding: number[] }[] };
  const first = Array.isArray(payload.data) && payload.data.length > 0 ? payload.data[0] : null;
  if (!first || !Array.isArray(first.embedding)) {
    console.error("OpenAI embeddings response missing embedding data");
    return null;
  }

  return first.embedding;
}

function toNumber(input: unknown): number | null {
  if (typeof input === "number" && Number.isFinite(input)) {
    return input;
  }

  if (typeof input === "string" && input.trim().length > 0) {
    const parsed = Number(input);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function sanitizeLimit(value: unknown, fallback: number): number {
  const parsed = toNumber(value);
  if (parsed === null) {
    return fallback;
  }
  return Math.min(Math.max(Math.trunc(parsed), 1), 100);
}

function sanitizeOffset(value: unknown): number {
  const parsed = toNumber(value);
  if (parsed === null) {
    return 0;
  }
  return Math.max(Math.trunc(parsed), 0);
}

function shouldFallbackOnRpcError(error: { message?: string } | null | undefined): boolean {
  const message = typeof error?.message === "string" ? error.message : "";
  return message.includes("structure of query does not match function result type");
}

async function runFallbackSearch(
  supabase: ReturnType<typeof createClient>,
  params: {
    query: string | null;
    categoryId: string | null;
    minPrice: number | null;
    maxPrice: number | null;
    city: string | null;
    limit: number;
    offset: number;
  },
) {
  const rangeEnd = params.limit > 0 ? params.offset + params.limit - 1 : params.offset;
  let query = supabase
    .from("products")
    .select(
      "id,title,description,price,currency,condition,category_id,seller_id,location,images,is_active,is_sold,is_promoted,views,created_at,updated_at",
    )
    .eq("is_active", true)
    .eq("is_sold", false);

  if (params.query && params.query.trim().length > 0) {
    query = query.textSearch("search_document", params.query, {
      config: "simple",
      type: "plain",
    });
  }

  if (params.categoryId) {
    query = query.eq("category_id", params.categoryId);
  }

  if (typeof params.minPrice === "number") {
    query = query.gte("price", params.minPrice);
  }

  if (typeof params.maxPrice === "number") {
    query = query.lte("price", params.maxPrice);
  }

  if (params.city && params.city.trim().length > 0) {
    query = query.ilike("location", `${params.city}%`);
  }

  query = query.order("created_at", { ascending: false });
  return await query.range(params.offset, rangeEnd);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method Not Allowed" }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  try {
    const supabaseKey = serviceRoleKey ?? anonKey;
    if (!supabaseUrl || !supabaseKey) {
      return new Response(
        JSON.stringify({ error: "Supabase credentials are not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const payload = await req.json().catch(() => ({}));

    const query =
      typeof payload?.query === "string" ? payload.query.slice(0, 120) : null;
    const categoryId =
      typeof payload?.categoryId === "string"
        ? payload.categoryId
        : null;
    const minPrice = toNumber(payload?.minPrice);
    const maxPrice = toNumber(payload?.maxPrice);
    const city =
      typeof payload?.city === "string" && payload.city.trim().length > 0
        ? payload.city.trim()
        : null;

    const limit = sanitizeLimit(payload?.limit, 24);
    const offset = sanitizeOffset(payload?.offset);

    const authHeader = req.headers.get("authorization");
    const clientOptions: {
      auth: { persistSession: boolean; autoRefreshToken: boolean };
      global?: { headers: Record<string, string> };
    } = {
      auth: { persistSession: false, autoRefreshToken: false },
    };

    if (!serviceRoleKey && authHeader) {
      clientOptions.global = { headers: { Authorization: authHeader } };
    }

    const supabase = createClient(supabaseUrl, supabaseKey, clientOptions);

    let queryEmbedding: number[] | null = null;
    const trimmedQuery = typeof query === "string" ? query.trim() : "";

    if (trimmedQuery.length > 0) {
      try {
        queryEmbedding = await createEmbedding(trimmedQuery.slice(0, 256));
      } catch (embeddingError) {
        console.error("Failed to create query embedding", embeddingError);
        queryEmbedding = null;
      }
    }

    if (
      queryEmbedding &&
      (queryEmbedding.length !== expectedEmbeddingLength ||
        queryEmbedding.some((value) => !Number.isFinite(value)))
    ) {
      console.warn(
        "OpenAI embedding length mismatch or invalid values detected, falling back to keyword search",
        {
          expected: expectedEmbeddingLength,
          actual: queryEmbedding.length,
        },
      );
      queryEmbedding = null;
    }

    const baseRpcArgs: Record<string, unknown> = {
      search_term: query,
      category: categoryId,
      min_price: minPrice,
      max_price: maxPrice,
      city,
      limit_count: limit,
      offset_count: offset,
    };

    let rpcName = queryEmbedding ? "search_products_semantic" : "search_products";
    let rpcArgs = queryEmbedding
      ? { ...baseRpcArgs, query_embedding: queryEmbedding }
      : baseRpcArgs;

    let { data, error } = await supabase.rpc(rpcName, rpcArgs);

    if (error && rpcName === "search_products_semantic") {
      console.warn("search_products_semantic rpc failed, retrying keyword search", error);
      rpcName = "search_products";
      rpcArgs = baseRpcArgs;
      const fallback = await supabase.rpc(rpcName, rpcArgs);
      data = fallback.data;
      error = fallback.error;
    }

    if (error && shouldFallbackOnRpcError(error)) {
      console.warn("RPC search failed with result mismatch, falling back to direct query", error);
      const fallback = await runFallbackSearch(supabase, {
        query,
        categoryId,
        minPrice,
        maxPrice,
        city,
        limit,
        offset,
      });
      if (!fallback.error) {
        data = fallback.data;
        error = null;
      }
    }

    if (error) {
      console.error(`${rpcName} rpc failed`, error);
      return new Response(
        JSON.stringify({ error: "Search failed", details: error.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    let totalCount: number | null = null;

    const countQuery = supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .eq("is_sold", false);

    if (query && query.trim().length > 0) {
      countQuery.textSearch("search_document", query, {
        config: "simple",
        type: "plain",
      });
    }

    if (categoryId) {
      countQuery.eq("category_id", categoryId);
    }

    if (typeof minPrice === "number") {
      countQuery.gte("price", minPrice);
    }

    if (typeof maxPrice === "number") {
      countQuery.lte("price", maxPrice);
    }

    if (city && city.trim().length > 0) {
      countQuery.ilike("location", `${city}%`);
    }

    const { count, error: countError } = await countQuery;

    if (countError) {
      console.error("search_products count query failed", countError);
    } else if (typeof count === "number") {
      totalCount = count;
    }

    return new Response(
      JSON.stringify({
        items: data ?? [],
        limit,
        offset,
        totalCount,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : "Unexpected error occurred";
    console.error("product-search edge function error:", cause);
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
