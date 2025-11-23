import { NextResponse } from 'next/server';
import { isLocale, type Locale } from '@/lib/locale/dictionary';
import {
  ensureUserTextTranslation,
  type UserTextField,
} from '@/lib/ai/translate-user-text';
import { getServerLocale } from '@/lib/locale/server';

type TranslateRequestBody = {
  text: string;
  sourceLocale?: string | null;
  targetLocale?: string | null;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as TranslateRequestBody;

    const text = typeof body.text === 'string' ? body.text : '';
    if (!text.trim()) {
      return NextResponse.json({ translatedText: '' });
    }

    const viewerLocale = await getServerLocale();

    const rawSourceLocale = body.sourceLocale;
    const rawTargetLocale = body.targetLocale ?? viewerLocale;

    const sourceLocale: Locale = isLocale(rawSourceLocale)
      ? rawSourceLocale
      : viewerLocale;
    const targetLocale: Locale = isLocale(rawTargetLocale)
      ? rawTargetLocale
      : viewerLocale;

    const field: UserTextField = {
      original: text,
      originalLocale: sourceLocale,
      translations: {},
    };

    const { text: translatedText, updatedField, isTranslated } =
      await ensureUserTextTranslation(field, targetLocale);

    return NextResponse.json({
      translatedText,
      isTranslated,
      originalLocale: updatedField.originalLocale,
      targetLocale,
    });
  } catch (error) {
    console.error('Translation API error', error);
    return NextResponse.json(
      { error: 'Translation failed' },
      { status: 500 },
    );
  }
}

