#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const loadedFromFiles = new Set();

function loadEnvFile(relativePath) {
  const absPath = path.join(process.cwd(), relativePath);
  if (!fs.existsSync(absPath)) return;

  const raw = fs.readFileSync(absPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (!match) continue;

    const [, key, rest] = match;
    let value = rest.trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined || loadedFromFiles.has(key)) {
      process.env[key] = value;
      loadedFromFiles.add(key);
    }
  }
}

function mask(value, { tail = 4 } = {}) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (text.length <= tail) return '*'.repeat(text.length);
  return `${'*'.repeat(Math.max(0, text.length - tail))}${text.slice(-tail)}`;
}

function normalizeE164(value) {
  if (!value) return '';
  return String(value).trim().replace(/[\s-]/g, '');
}

function base64ToPem(base64) {
  const decoded = Buffer.from(String(base64).trim(), 'base64').toString('utf8');
  if (!decoded.includes('BEGIN') || !decoded.includes('PRIVATE KEY')) {
    throw new Error('VONAGE_PRIVATE_KEY64 does not decode to a PEM private key');
  }
  return decoded;
}

function signJwtRs256(payload, privateKeyPem) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const encode = (obj) =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

  const headerPart = encode(header);
  const payloadPart = encode(payload);
  const data = `${headerPart}.${payloadPart}`;

  const signature = crypto
    .sign('RSA-SHA256', Buffer.from(data), privateKeyPem)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${data}.${signature}`;
}

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`${res.status} ${res.statusText}`);
    err.details = text.slice(0, 500);
    throw err;
  }
  return JSON.parse(text);
}

function summarizePresence(value) {
  const trimmed = String(value ?? '').trim();
  return { present: Boolean(trimmed), length: trimmed.length };
}

if (process.env.NODE_ENV !== 'production') {
  loadEnvFile('.env');
  loadEnvFile('.env.local');
}

const apiKey = process.env.VONAGE_API_KEY?.trim();
const apiSecret = process.env.VONAGE_API_SECRET?.trim();
const applicationId = process.env.VONAGE_APPLICATION_ID?.trim();
const privateKey64 = process.env.VONAGE_PRIVATE_KEY64?.trim();
const virtualNumber = normalizeE164(process.env.VONAGE_VIRTUAL_NUMBER);

console.log('Vonage env status (no secrets shown):');
console.log(
  JSON.stringify(
    {
      VONAGE_API_KEY: apiKey ? { present: true, masked: mask(apiKey, { tail: 2 }) } : { present: false },
      VONAGE_API_SECRET: apiSecret ? { present: true, masked: mask(apiSecret) } : { present: false },
      VONAGE_APPLICATION_ID: summarizePresence(applicationId),
      VONAGE_PRIVATE_KEY64: summarizePresence(privateKey64),
      VONAGE_VIRTUAL_NUMBER: summarizePresence(virtualNumber),
    },
    null,
    2
  )
);

if (!apiKey || !apiSecret) {
  console.error('Missing VONAGE_API_KEY and/or VONAGE_API_SECRET.');
  process.exit(1);
}

try {
  const balance = await fetchJson(
    `https://rest.nexmo.com/account/get-balance?api_key=${encodeURIComponent(apiKey)}&api_secret=${encodeURIComponent(apiSecret)}`,
    { headers: { accept: 'application/json' } }
  );
  const eur = balance?.value ?? balance?.balance;
  console.log(`Balance: EUR ${eur ?? '(unknown)'}`);
} catch (error) {
  console.error('Balance check failed:', error?.message ?? error);
  if (error?.details) console.error(String(error.details));
  process.exit(1);
}

try {
  const numbers = await fetchJson(
    `https://rest.nexmo.com/account/numbers?api_key=${encodeURIComponent(apiKey)}&api_secret=${encodeURIComponent(apiSecret)}`,
    { headers: { accept: 'application/json' } }
  );

  const owned = Array.isArray(numbers?.numbers) ? numbers.numbers : [];
  const normalized = owned
    .map((n) => normalizeE164(n?.msisdn ?? n?.number ?? ''))
    .filter(Boolean);

  const hasVirtualNumber = Boolean(
    virtualNumber &&
      normalized.some((n) => n === virtualNumber || n === virtualNumber.replace(/^\+/, ''))
  );

  console.log(`Owned numbers: ${normalized.length}`);
  if (virtualNumber) {
    console.log(`VONAGE_VIRTUAL_NUMBER matches owned number: ${hasVirtualNumber}`);
  } else if (normalized.length > 0) {
    console.log(
      `Tip: set VONAGE_VIRTUAL_NUMBER to one of your owned numbers (e.g. +${normalized[0]})`
    );
  }
} catch (error) {
  console.error('List numbers failed:', error?.message ?? error);
  if (error?.details) console.error(String(error.details));
}

if (applicationId && privateKey64) {
  try {
    const privateKeyPem = base64ToPem(privateKey64);
    const now = Math.floor(Date.now() / 1000);
    const jwt = signJwtRs256(
      {
        application_id: applicationId,
        iat: now,
        exp: now + 60,
        jti: crypto.randomUUID(),
      },
      privateKeyPem
    );

    // Best-effort: verify the application can be fetched using JWT auth.
    const app = await fetchJson(`https://api.nexmo.com/v2/applications/${applicationId}`, {
      headers: { authorization: `Bearer ${jwt}`, accept: 'application/json' },
    });

    console.log('Application JWT auth: ok');
    if (app?.name) console.log(`Application name: ${app.name}`);
  } catch (error) {
    console.log('Application JWT auth: failed (non-fatal)');
    console.log(String(error?.message ?? error));
    if (error?.details) console.log(String(error.details));
  }
}

