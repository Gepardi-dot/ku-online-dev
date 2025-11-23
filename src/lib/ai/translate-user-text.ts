import 'server-only';

import type { Locale } from '@/lib/locale/dictionary';

export type UserTextTranslations = Partial<Record<Locale, string>>;

export interface UserTextField {
  original: string;
  originalLocale: Locale;
  translations?: UserTextTranslations;
}

const DEFAULT_TRANSLATION_MODEL = process.env.OPENAI_TRANSLATION_MODEL || 'gpt-4o-mini';

function resolveLocale(value: string | null | undefined, fallback: Locale): Locale {
  if (!value) return fallback;
  const normalized = value as Locale;
  return normalized;
}

export function getLocalizedUserText(
  field: UserTextField,
  viewerLocale: Locale,
): {
  text: string;
  isTranslated: boolean;
  sourceLocale: Locale;
} {
  if (!field.original) {
    return { text: '', isTranslated: false, sourceLocale: field.originalLocale };
  }

  if (viewerLocale === field.originalLocale) {
    return { text: field.original, isTranslated: false, sourceLocale: field.originalLocale };
  }

  const translated = field.translations?.[viewerLocale];
  if (translated && translated.trim().length > 0) {
    return { text: translated, isTranslated: true, sourceLocale: field.originalLocale };
  }

  return { text: field.original, isTranslated: false, sourceLocale: field.originalLocale };
}

export async function translateUserText(
  text: string,
  sourceLocale: Locale,
  targetLocale: Locale,
): Promise<string> {
  if (!text.trim()) {
    return text;
  }

  if (sourceLocale === targetLocale) {
    return text;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const safeText = text.slice(0, 4000);

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEFAULT_TRANSLATION_MODEL,
      messages: [
        {
          role: 'system',
          content: [
            `You translate marketplace user-generated content between languages.`,
            `Keep brand names and product model names in their original form where natural.`,
            `Do not add explanations, comments, or quotes – return only the translated text.`,
          ].join(' '),
        },
        {
          role: 'user',
          content: `Translate the following text from ${sourceLocale} to ${targetLocale}:\n\n${safeText}`,
        },
      ],
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`Translation request failed (${response.status}): ${errorBody}`);
  }

  const data: any = await response.json();
  const message = data?.choices?.[0]?.message;

  if (!message) {
    throw new Error('Translation response did not contain a message');
  }

  if (typeof message.content === 'string') {
    return message.content.trim();
  }

  if (Array.isArray(message.content)) {
    const combined = message.content
      .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
      .join('')
      .trim();
    if (combined) return combined;
  }

  throw new Error('Unable to read translated content from response');
}

export async function ensureUserTextTranslation(
  field: UserTextField,
  viewerLocale: Locale,
  detectSourceLocale?: string | null,
): Promise<{ text: string; updatedField: UserTextField; isTranslated: boolean }> {
  const sourceLocale = resolveLocale(detectSourceLocale, field.originalLocale);

  if (!field.original.trim() || viewerLocale === sourceLocale) {
    return {
      text: field.original,
      updatedField: field,
      isTranslated: false,
    };
  }

  const existing = field.translations?.[viewerLocale];
  if (existing && existing.trim().length > 0) {
    return {
      text: existing,
      updatedField: field,
      isTranslated: true,
    };
  }

  const translated = await translateUserText(field.original, sourceLocale, viewerLocale);

  const nextTranslations: UserTextTranslations = {
    ...(field.translations ?? {}),
    [viewerLocale]: translated,
  };

  return {
    text: translated,
    updatedField: {
      ...field,
      originalLocale: sourceLocale,
      translations: nextTranslations,
    },
    isTranslated: true,
  };
}

