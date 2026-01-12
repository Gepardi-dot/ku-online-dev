#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

const {
  NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  OPENAI_API_KEY,
  EMBEDDING_BATCH_SIZE,
} = process.env;

if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

if (!OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY env var.");
  process.exit(1);
}

const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const batchSize = Number(EMBEDDING_BATCH_SIZE ?? 10);
const model = process.env.EMBEDDING_MODEL ?? "text-embedding-3-small";
const openAiEndpoint = "https://api.openai.com/v1/embeddings";

async function fetchPendingProducts(limit) {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("products")
    .select("id, title, description, category_id, location")
    .is("embedding", null)
    .eq("is_active", true)
    .eq("is_sold", false)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function createEmbeddings(inputs) {
  const response = await fetch(openAiEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      input: inputs,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI embeddings failed: ${response.status} ${body}`);
  }

  const payload = await response.json();
  return payload.data.map((item) => item.embedding);
}

async function updateEmbedding(productId, embedding) {
  const { error } = await supabase
    .from("products")
    .update({ embedding })
    .eq("id", productId);

  if (error) {
    throw error;
  }
}

async function main() {
  console.log("Starting embedding backfill...");
  while (true) {
    const products = await fetchPendingProducts(batchSize);
    if (products.length === 0) {
      console.log("All product embeddings populated.");
      break;
    }

    const inputs = products.map((product) => {
      const parts = [
        product.title ?? "",
        product.description ?? "",
        product.location ?? "",
      ].filter(Boolean);
      return parts.join("\n\n");
    });

    console.log(`Embedding batch of ${products.length} products...`);
    const embeddings = await createEmbeddings(inputs);

    for (let i = 0; i < products.length; i += 1) {
      await updateEmbedding(products[i].id, embeddings[i]);
    }
  }
  console.log("Embedding backfill completed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
