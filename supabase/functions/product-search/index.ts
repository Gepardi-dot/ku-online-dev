import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno&no-check";
import { corsHeaders } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl) {
  throw new Error("SUPABASE_URL is not configured");
}

if (!serviceRoleKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
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
    const payload = await req.json();

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

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase.rpc("search_products", {
      search_term: query,
      category: categoryId,
      min_price: minPrice,
      max_price: maxPrice,
      city,
      limit_count: limit,
      offset_count: offset,
    });

    if (error) {
      console.error("search_products rpc failed", error);
      return new Response(
        JSON.stringify({ error: "Search failed", details: error.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({
        items: data ?? [],
        limit,
        offset,
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
