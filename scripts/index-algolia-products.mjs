#!/usr/bin/env node

import { algoliasearch } from "algoliasearch";
import { createClient } from "@supabase/supabase-js";

const {
  NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  ALGOLIA_APP_ID,
  ALGOLIA_ADMIN_API_KEY,
  ALGOLIA_INDEX_NAME,
  ALGOLIA_BATCH_SIZE,
} = process.env;

if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

if (!ALGOLIA_APP_ID || !ALGOLIA_ADMIN_API_KEY || !ALGOLIA_INDEX_NAME) {
  console.error("Missing Algolia env vars. Set ALGOLIA_APP_ID, ALGOLIA_ADMIN_API_KEY, and ALGOLIA_INDEX_NAME.");
  process.exit(1);
}

const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const client = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_ADMIN_API_KEY);
const indexName = ALGOLIA_INDEX_NAME;

const args = new Set(process.argv.slice(2));
const shouldClear = args.has("--clear");

const batchSize = Number(ALGOLIA_BATCH_SIZE ?? 500);
const limit = Number.isFinite(batchSize) && batchSize > 0 ? Math.min(batchSize, 1000) : 500;

function parseNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function toTimestamp(value) {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSearchText(value) {
  if (!value) {
    return "";
  }

  const stripped = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  return stripped
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, "")
    .replace(/[\u0622\u0623\u0625]/g, "\u0627")
    .replace(/\u0649/g, "\u064A")
    .replace(/\u0629/g, "\u0647")
    .replace(/\u0643/g, "\u06A9")
    .replace(/\u064A/g, "\u06CC")
    .replace(/\u0624/g, "\u0648")
    .replace(/\u0626/g, "\u06CC");
}

function normalizeLocation(value) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

function buildSearchText(parts) {
  const raw = parts
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .trim();

  if (!raw) {
    return "";
  }

  const normalized = normalizeSearchText(raw);
  if (!normalized || normalized === raw) {
    return raw;
  }

  return `${raw} ${normalized}`;
}

function deriveThumbPath(path) {
  if (!path) {
    return null;
  }
  const normalized = String(path).trim();
  if (!normalized) {
    return null;
  }
  const lastSlash = normalized.lastIndexOf("/");
  const fileName = lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
  if (fileName.includes("-thumb.")) {
    return normalized;
  }
  if (fileName.includes("-full.")) {
    return normalized.replace("-full.", "-thumb.");
  }
  const dotIndex = fileName.lastIndexOf(".");
  const baseName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  const extension = dotIndex > 0 ? fileName.slice(dotIndex + 1).toLowerCase() : "";
  const thumbExtension = extension === "avif" ? "avif" : "webp";
  const prefix = lastSlash >= 0 ? normalized.slice(0, lastSlash + 1) : "";
  return `${prefix}${baseName}-thumb.${thumbExtension}`;
}

function toAlgoliaRecord(row) {
  if (!row?.id) {
    return null;
  }

  const category = row.category ?? null;
  const seller = row.seller ?? null;
  const title = row.title ?? "";
  const description = row.description ?? "";
  const imagePaths = Array.isArray(row.images) ? row.images : [];
  const primaryImage = imagePaths[0] ?? null;
  const imageThumbPath = deriveThumbPath(primaryImage);
  const createdAtTs = toTimestamp(row.created_at);
  const expiresAtTs =
    toTimestamp(row.expires_at) ??
    (createdAtTs ? createdAtTs + 90 * 24 * 60 * 60 * 1000 : null);
  const searchText = buildSearchText([
    title,
    description,
    row.location ?? "",
    category?.name ?? "",
    category?.name_ar ?? "",
    category?.name_ku ?? "",
  ]);

  return {
    objectID: row.id,
    id: row.id,
    title,
    description,
    price: parseNumber(row.price) ?? 0,
    original_price: parseNumber(row.original_price),
    currency: row.currency ?? null,
    condition: row.condition ?? null,
    color_token: row.color_token ?? null,
    category_id: row.category_id ?? null,
    category_name: category?.name ?? null,
    category_name_ar: category?.name_ar ?? null,
    category_name_ku: category?.name_ku ?? null,
    seller_id: row.seller_id ?? null,
    seller_full_name: seller?.full_name ?? null,
    seller_name: seller?.name ?? null,
    seller_email: seller?.email ?? null,
    seller_avatar: seller?.avatar_url ?? null,
    seller_is_verified: Boolean(seller?.is_verified),
    location: row.location ?? null,
    location_normalized: normalizeLocation(row.location),
    images: imagePaths,
    image_thumb_path: imageThumbPath,
    is_active: typeof row.is_active === "boolean" ? row.is_active : true,
    is_sold: typeof row.is_sold === "boolean" ? row.is_sold : false,
    is_promoted: typeof row.is_promoted === "boolean" ? row.is_promoted : false,
    views: parseNumber(row.views) ?? 0,
    created_at: row.created_at ?? null,
    created_at_ts: createdAtTs,
    expires_at_ts: expiresAtTs,
    updated_at: row.updated_at ?? null,
    search_text: searchText,
  };
}

async function fetchProducts(offset) {
  const { data, error } = await supabase
    .from("products")
    .select(`
      id,
      title,
      description,
      price,
      original_price,
      currency,
      condition,
      color_token,
      category_id,
      seller_id,
      location,
      images,
      is_active,
      is_sold,
      is_promoted,
      views,
      created_at,
      expires_at,
      updated_at,
      category:categories(
        id,
        name,
        name_ar,
        name_ku
      ),
      seller:users(
        id,
        email,
        full_name,
        name,
        avatar_url,
        is_verified
      )
    `)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function configureIndex() {
  try {
    const replicas = [
      `${indexName}_newest`,
      `${indexName}_price_asc`,
      `${indexName}_price_desc`,
      `${indexName}_views_desc`,
    ];

    const task = await client.setSettings({
      indexName,
      indexSettings: {
        searchableAttributes: [
          "title",
          "description",
          "search_text",
          "category_name",
          "category_name_ar",
          "category_name_ku",
          "location",
        ],
        attributesForFaceting: [
          "filterOnly(category_id)",
          "filterOnly(condition)",
          "filterOnly(color_token)",
          "filterOnly(location_normalized)",
          "filterOnly(is_active)",
          "filterOnly(is_sold)",
        ],
        replicas,
      },
    });

    if (task?.taskID) {
      await client.waitForTask({ indexName, taskID: task.taskID });
    }

    const replicaSettings = [
      { name: `${indexName}_newest`, customRanking: ["desc(created_at_ts)"] },
      { name: `${indexName}_price_asc`, customRanking: ["asc(price)"] },
      { name: `${indexName}_price_desc`, customRanking: ["desc(price)"] },
      { name: `${indexName}_views_desc`, customRanking: ["desc(views)"] },
    ];

    for (const replica of replicaSettings) {
      const replicaTask = await client.setSettings({
        indexName: replica.name,
        indexSettings: {
          searchableAttributes: [
            "title",
            "description",
            "search_text",
            "category_name",
            "category_name_ar",
            "category_name_ku",
            "location",
          ],
          attributesForFaceting: [
            "filterOnly(category_id)",
            "filterOnly(condition)",
            "filterOnly(color_token)",
            "filterOnly(location_normalized)",
            "filterOnly(is_active)",
            "filterOnly(is_sold)",
          ],
          customRanking: replica.customRanking,
        },
      });

      if (replicaTask?.taskID) {
        await client.waitForTask({ indexName: replica.name, taskID: replicaTask.taskID });
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("Unable to update Algolia index settings. Continuing.", message);
  }
}

async function main() {
  console.log(`Indexing Algolia index "${ALGOLIA_INDEX_NAME}"...`);

  await configureIndex();

  if (shouldClear) {
    console.log("Clearing Algolia index...");
    try {
      const task = await client.clearObjects({ indexName });
      if (task?.taskID) {
        await client.waitForTask({ indexName, taskID: task.taskID });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("Unable to clear Algolia index. Continuing.", message);
    }
  }

  let offset = 0;
  while (true) {
    const rows = await fetchProducts(offset);
    if (rows.length === 0) {
      break;
    }

    const records = rows.map((row) => toAlgoliaRecord(row)).filter(Boolean);
    if (records.length > 0) {
      await client.saveObjects({
        indexName,
        objects: records,
        waitForTasks: true,
        batchSize: limit,
      });
    }

    offset += rows.length;
    console.log(`Indexed ${offset} products...`);

    if (rows.length < limit) {
      break;
    }
  }

  console.log("Algolia indexing complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
