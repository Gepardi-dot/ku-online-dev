import 'server-only';

import { createHash } from 'node:crypto';

type TranslationMap = Record<string, string>;

export type ProductFieldTranslations = {
  title: TranslationMap;
  description: TranslationMap;
  sourceHash: string;
};

const DEFAULT_TRANSLATION_MODEL = process.env.OPENAI_TRANSLATION_MODEL || 'gpt-4o-mini';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeText(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function clampText(value: string | null | undefined, maxLength: number): string {
  const text = normalizeText(value);
  if (!text) return '';
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function coerceTranslationMap(value: unknown): TranslationMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const result: TranslationMap = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    result[key] = trimmed;
  }

  return result;
}

export async function translateProductFields(input: {
  title: string | null | undefined;
  description: string | null | undefined;
}): Promise<ProductFieldTranslations> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const safeTitle = clampText(input.title, 140);
  const safeDescription = clampText(input.description, 1000);
  const sourceHash = sha256(`${safeTitle}\n\n${safeDescription}`.trim());

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEFAULT_TRANSLATION_MODEL,
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
            input: { title: safeTitle, description: safeDescription },
            output_schema: {
              title: { ar: 'string', ku: 'string', ku_latn: 'string' },
              description: { ar: 'string', ku: 'string', ku_latn: 'string' },
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

  const payload: any = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('OpenAI translation response missing content');
  }

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('OpenAI translation response was not valid JSON');
  }

  const titleMap = coerceTranslationMap(parsed?.title);
  const descriptionMap = coerceTranslationMap(parsed?.description);

  return {
    sourceHash,
    title: {
      ar: clampText(titleMap.ar, 140),
      ku: clampText(titleMap.ku, 140),
      ku_latn: clampText(titleMap.ku_latn, 140),
    },
    description: {
      ar: clampText(descriptionMap.ar, 1000),
      ku: clampText(descriptionMap.ku, 1000),
      ku_latn: clampText(descriptionMap.ku_latn, 1000),
    },
  };
}
