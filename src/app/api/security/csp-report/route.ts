import { NextResponse } from 'next/server';

import { checkRateLimit, getClientIdentifier } from '@/lib/security/request';
import { withSentryRoute } from '@/utils/sentry-route';

export const runtime = 'nodejs';

const MAX_REPORT_BODY_BYTES = 128 * 1024;
const RATE_LIMIT_PER_IP = { windowMs: 60_000, max: 180 } as const;

type CspReportSummary = {
  documentUri: string | null;
  blockedUri: string | null;
  violatedDirective: string | null;
  effectiveDirective: string | null;
  sourceFile: string | null;
  lineNumber: number | null;
  columnNumber: number | null;
  disposition: string | null;
};

function toNullableString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toNullableNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function pickObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function extractCspReport(payload: unknown): Record<string, unknown> | null {
  const root = pickObject(payload);
  if (!root) return null;

  const legacy = pickObject(root['csp-report']);
  if (legacy) return legacy;

  const body = pickObject(root.body);
  if (body) return body;

  return root;
}

function summarizeReport(report: Record<string, unknown>): CspReportSummary {
  return {
    documentUri: toNullableString(report['document-uri']),
    blockedUri: toNullableString(report['blocked-uri']),
    violatedDirective: toNullableString(report['violated-directive']),
    effectiveDirective: toNullableString(report['effective-directive']),
    sourceFile: toNullableString(report['source-file']),
    lineNumber: toNullableNumber(report['line-number']),
    columnNumber: toNullableNumber(report['column-number']),
    disposition: toNullableString(report.disposition),
  };
}

export const POST = withSentryRoute(async (request: Request) => {
  const clientIdentifier = getClientIdentifier(request.headers);
  if (clientIdentifier !== 'unknown') {
    const ipRate = checkRateLimit(`csp-report:ip:${clientIdentifier}`, RATE_LIMIT_PER_IP);
    if (!ipRate.success) {
      const response = new NextResponse(null, { status: 429 });
      response.headers.set('Retry-After', String(Math.max(1, ipRate.retryAfter)));
      return response;
    }
  }

  const rawBody = await request.text();
  if (!rawBody) {
    return new NextResponse(null, { status: 204 });
  }

  if (Buffer.byteLength(rawBody, 'utf8') > MAX_REPORT_BODY_BYTES) {
    return new NextResponse(null, { status: 413 });
  }

  let payload: unknown = null;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const reports = Array.isArray(payload) ? payload : [payload];
  for (const entry of reports) {
    const report = extractCspReport(entry);
    if (!report) continue;
    const summary = summarizeReport(report);

    if (
      process.env.NODE_ENV !== 'production' ||
      summary.effectiveDirective?.startsWith('script-src') ||
      summary.effectiveDirective?.startsWith('object-src')
    ) {
      console.warn('[csp-report]', summary);
    } else {
      console.info('[csp-report]', {
        effectiveDirective: summary.effectiveDirective,
        blockedUri: summary.blockedUri,
      });
    }
  }

  return new NextResponse(null, { status: 204 });
}, 'security-csp-report');

function methodNotAllowed() {
  return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 });
}

export const GET = methodNotAllowed;
export const PUT = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const OPTIONS = methodNotAllowed;
export const HEAD = methodNotAllowed;
