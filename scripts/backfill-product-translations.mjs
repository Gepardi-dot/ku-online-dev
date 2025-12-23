#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { algoliasearch } from 'algoliasearch';
import { createClient } from '@supabase/supabase-js';

const {
  NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  OPENAI_API_KEY,
  OPENAI_TRANSLATION_MODEL,
  ALGOLIA_APP_ID,
  ALGOLIA_ADMIN_API_KEY,
  ALGOLIA_INDEX_NAME,
  PRODUCT_I18N_BATCH_SIZE,
  PRODUCT_I18N_MAX_PRODUCTS,
} = process.env;

if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

if (!OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY env var.');
  process.exit(1);
}

if (!ALGOLIA_APP_ID || !ALGOLIA_ADMIN_API_KEY || !ALGOLIA_INDEX_NAME) {
  console.error('Missing Algolia env vars. Set ALGOLIA_APP_ID, ALGOLIA_ADMIN_API_KEY, and ALGOLIA_INDEX_NAME.');
  process.exit(1);
}

const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const algolia = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_ADMIN_API_KEY);

const batchSize = Number(PRODUCT_I18N_BATCH_SIZE ?? 10);
const maxProducts = Number(PRODUCT_I18N_MAX_PRODUCTS ?? 500);
const model = OPENAI_TRANSLATION_MODEL ?? 'gpt-4o-mini';
const ALGOLIA_DESCRIPTION_SNIPPET_MAX = 800;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function clampText(value, maxLength) {
  const text = normalizeText(value);
  if (!text) return '';
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function coerceTranslationMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    result[key] = trimmed;
  }
  return result;
}

async function translateFields({ title, description }) {
  const safeTitle = clampText(title, 140);
  const safeDescription = clampText(description, 1000);

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'You translate marketplace product listings.',
            'Return ONLY valid JSON (no markdown, no extra keys).',
            'Preserve brand names and model numbers; do not add commentary.',
            'For Kurdish:',
            '- "ku" must be Central Kurdish (Sorani) in Arabic script.',
            '- "ku_latn" must be Kurdish in Latin script (Kurmanji/romanized) and easily searchable.',
          ].join(' '),
        },
        {
          role: 'user',
          content: JSON.stringify({
            input: {
              title: safeTitle,
              description: safeDescription,
            },
            output_schema: {
              title: { en: 'string', ar: 'string', ku: 'string', ku_latn: 'string' },
              description: { en: 'string', ar: 'string', ku: 'string', ku_latn: 'string' },
            },
          }),
        },
      ],
      temperature: 0,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`OpenAI translation failed: ${response.status} ${body}`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('OpenAI translation response missing content');
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('OpenAI translation response was not valid JSON');
  }

  const titleMap = coerceTranslationMap(parsed?.title);
  const descriptionMap = coerceTranslationMap(parsed?.description);

  const result = {
    title: {
      en: clampText(titleMap.en, 140),
      ar: clampText(titleMap.ar, 140),
      ku: clampText(titleMap.ku, 140),
      ku_latn: clampText(titleMap.ku_latn, 140),
    },
    description: {
      en: clampText(descriptionMap.en, 1000),
      ar: clampText(descriptionMap.ar, 1000),
      ku: clampText(descriptionMap.ku, 1000),
      ku_latn: clampText(descriptionMap.ku_latn, 1000),
    },
  };

  return result;
}

async function fetchPendingProducts(limit) {
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from('products')
    .select('id,title,description,i18n_source_hash')
    .eq('is_active', true)
    .gt('expires_at', nowIso)
    .is('i18n_source_hash', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function updateProductTranslations(productId, translations, sourceHash) {
  const { error } = await supabase
    .from('products')
    .update({
      title_translations: translations.title,
      description_translations: translations.description,
      i18n_source_hash: sourceHash,
      i18n_updated_at: new Date().toISOString(),
    })
    .eq('id', productId);

  if (error) {
    throw error;
  }
}

async function updateAlgoliaTranslations(objects) {
  if (objects.length === 0) return;

  await algolia.partialUpdateObjects({
    indexName: ALGOLIA_INDEX_NAME,
    objects,
    waitForTasks: false,
  });
}

function toAlgoliaPatch(productId, translations) {
  return {
    objectID: productId,
    title_i18n_en: translations.title.en || null,
    title_i18n_ar: translations.title.ar || null,
    title_i18n_ku: translations.title.ku || null,
    title_i18n_ku_latn: translations.title.ku_latn || null,
    description_i18n_en: clampText(translations.description.en, ALGOLIA_DESCRIPTION_SNIPPET_MAX) || null,
    description_i18n_ar: clampText(translations.description.ar, ALGOLIA_DESCRIPTION_SNIPPET_MAX) || null,
    description_i18n_ku: clampText(translations.description.ku, ALGOLIA_DESCRIPTION_SNIPPET_MAX) || null,
    description_i18n_ku_latn:
      clampText(translations.description.ku_latn, ALGOLIA_DESCRIPTION_SNIPPET_MAX) || null,
  };
}

async function main() {
  console.log('Starting product translation backfill...');

  let processed = 0;
  while (processed < maxProducts) {
    const remaining = Math.max(1, maxProducts - processed);
    const take = Math.min(batchSize, remaining);

    const products = await fetchPendingProducts(take);
    if (products.length === 0) {
      break;
    }

    const algoliaPatches = [];

    for (const product of products) {
      const title = normalizeText(product.title);
      const description = typeof product.description === 'string' ? product.description : '';
      const sourceHash = sha256(`${title}\n\n${description}`.trim());

      console.log(`Translating ${product.id}...`);
      const translations = await translateFields({ title, description });

      await updateProductTranslations(product.id, translations, sourceHash);
      algoliaPatches.push(toAlgoliaPatch(product.id, translations));

      processed += 1;
      if (processed >= maxProducts) break;
    }

    await updateAlgoliaTranslations(algoliaPatches);
    console.log(`Translated ${processed} products so far...`);
  }

  console.log(`Product translation backfill complete. Updated ${processed} products.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
