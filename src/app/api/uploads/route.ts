import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { createClient as createServerClient } from '@/utils/supabase/server';

import { getEnv } from '@/lib/env';
import { buildOriginAllowList, checkRateLimit, getClientIdentifier, isOriginAllowed } from '@/lib/security/request';
import { withSentryRoute } from '@/utils/sentry-route';

export const runtime = 'nodejs';

const {
  NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET,
  NEXT_PUBLIC_SITE_URL,
} = getEnv();
const STORAGE_BUCKET = NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ?? 'product-images';

// Tunable image processing defaults
const MAX_EDGE_PX = Number.parseInt(process.env.UPLOAD_MAX_EDGE ?? '1600');
const WEBP_QUALITY = Number.parseInt(process.env.UPLOAD_WEBP_QUALITY ?? '82');
const MIN_MASTER_BYTES = Number.parseInt(process.env.UPLOAD_WEBP_MIN_BYTES ?? '80000'); // ~80KB floor

// Accept up to 50MB as input; we compress to WebP before storing
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const UPLOAD_RATE_LIMIT_PER_USER = { windowMs: 60_000, max: 10 } as const;
const UPLOAD_RATE_LIMIT_PER_IP = { windowMs: 60_000, max: 30 } as const;
const DELETE_RATE_LIMIT_PER_USER = { windowMs: 60_000, max: 20 } as const;

const uploadOriginAllowList = buildOriginAllowList([
  NEXT_PUBLIC_SITE_URL ?? null,
  process.env.SITE_URL ?? null,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  'https://ku-online.vercel.app',
  'http://localhost:5000',
]);

const ACCEPTED_FILE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'avif'];
const ACCEPTED_FILE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

if (!NEXT_PUBLIC_SUPABASE_URL || !NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  throw new Error('Supabase URL or anon key is not configured.');
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY must be set to enable media uploads.');
}

const supabaseAdmin = createAdminClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

let bucketInitialization: Promise<void> | null = null;

function isNotFoundError(error: { status?: number; message?: string } | null): boolean {
  if (!error) {
    return false;
  }
  if (error.status === 404) {
    return true;
  }
  return typeof error.message === 'string' && error.message.toLowerCase().includes('not found');
}

function isAlreadyExistsError(error: { status?: number; message?: string } | null): boolean {
  if (!error) {
    return false;
  }
  if (error.status === 409) {
    return true;
  }
  return typeof error.message === 'string' && error.message.toLowerCase().includes('already exists');
}

function isBucketMissingError(error: { status?: number; message?: string } | null): boolean {
  if (!error) {
    return false;
  }
  if (error.status === 404) {
    return true;
  }
  const message = error.message?.toLowerCase() ?? '';
  return message.includes('bucket not found') || message.includes('not found') || message.includes('does not exist');
}

async function ensureStorageBucket(): Promise<void> {
  if (bucketInitialization) {
    return bucketInitialization;
  }

  bucketInitialization = (async () => {
    const { data: existingBucket, error: fetchError } = await supabaseAdmin.storage.getBucket(STORAGE_BUCKET);

    if (!existingBucket && isNotFoundError(fetchError)) {
      const { error: createError } = await supabaseAdmin.storage.createBucket(STORAGE_BUCKET, {
        public: true,
      });

      if (createError && !isAlreadyExistsError(createError)) {
        throw createError;
      }

      if (!createError) {
        return;
      }
    } else if (fetchError && !isNotFoundError(fetchError)) {
      throw fetchError;
    } else if (existingBucket?.public) {
      return;
    }

    const { error: updateError } = await supabaseAdmin.storage.updateBucket(STORAGE_BUCKET, {
      public: true,
    });

    if (updateError) {
      throw updateError;
    }
  })().catch((error) => {
    bucketInitialization = null;
    throw error;
  });

  return bucketInitialization;
}

async function uploadToBucketOnce(
  path: string,
  file: Buffer,
  options: {
    contentType: string;
    cacheControl: string;
    upsert: boolean;
  },
) {
  return supabaseAdmin.storage.from(STORAGE_BUCKET).upload(path, file, options);
}

type AuthenticatedUser = {
  id: string;
};

async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const cookieStore = await cookies();
  const supabase = await createServerClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user ? { id: user.id } : null;
}

function determineIncomingType(file: File): 'jpg' | 'png' | 'webp' | 'avif' | null {
  const nameExtension = file.name.split('.').pop()?.toLowerCase();
  if (nameExtension && ACCEPTED_FILE_EXTENSIONS.includes(nameExtension)) {
    return nameExtension === 'jpeg' ? 'jpg' : (nameExtension as any);
  }
  const type = file.type.toLowerCase();
  switch (type) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/avif':
      return 'avif';
    default:
      return null;
  }
}

function tooManyRequestsResponse(retryAfter: number, message: string) {
  const response = NextResponse.json({ error: message }, { status: 429 });
  response.headers.set('Retry-After', String(Math.max(1, retryAfter)));
  return response;
}

async function isHighResCategory(categoryId: string | null | undefined): Promise<boolean> {
  if (!categoryId || typeof categoryId !== 'string' || categoryId.trim().length === 0) {
    return false;
  }
  try {
    const { data, error } = await supabaseAdmin
      .from('categories')
      .select('id, name, name_ar, name_ku')
      .eq('id', categoryId)
      .maybeSingle();
    if (error || !data) return false;
    const candidates = [data.name, (data as any).name_ar, (data as any).name_ku]
      .filter(Boolean)
      .map((s: string) => s.toLowerCase());
    const keywords = ['vehicle', 'vehicles', 'car', 'cars', 'auto', 'automotive', 'real estate', 'property', 'properties', 'house', 'home for sale'];
    return candidates.some((name: string) => keywords.some((kw) => name.includes(kw)));
  } catch {
    return false;
  }
}

async function encodeWebp(
  input: Buffer,
  options: { maxEdge?: number; quality?: number },
): Promise<Buffer> {
  const base = sharp(input, { limitInputPixels: 10000 * 10000 }).rotate();
  return base
    .resize({
      width: options.maxEdge ?? MAX_EDGE_PX,
      height: options.maxEdge ?? MAX_EDGE_PX,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: Math.max(60, Math.min(95, Math.round(options.quality ?? WEBP_QUALITY))), effort: 5 })
    .toBuffer();
}

export const POST = withSentryRoute(async (request: Request) => {
  const originHeader = request.headers.get('origin');
  if (originHeader && !isOriginAllowed(originHeader, uploadOriginAllowList)) {
    return NextResponse.json({ error: 'Origin is not allowed to perform uploads.' }, { status: 403 });
  }

  const clientIdentifier = getClientIdentifier(request.headers);
  if (clientIdentifier !== 'unknown') {
    const ipRate = checkRateLimit(`upload:ip:${clientIdentifier}`, UPLOAD_RATE_LIMIT_PER_IP);
    if (!ipRate.success) {
      return tooManyRequestsResponse(ipRate.retryAfter, 'Too many upload attempts from this network. Please try again later.');
    }
  }

  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const userRate = checkRateLimit(`upload:user:${user.id}`, UPLOAD_RATE_LIMIT_PER_USER);
  if (!userRate.success) {
    return tooManyRequestsResponse(userRate.retryAfter, 'Upload rate limit reached. Please wait and retry.');
  }

  try {
    await ensureStorageBucket();
  } catch (error) {
    console.error('Failed to initialize storage bucket', error);
    return NextResponse.json({ error: 'Storage bucket is not configured.' }, { status: 500 });
  }

  const formData = await request.formData();
  const fileEntry = formData.get('file');
  const categoryId = (() => {
    const raw = formData.get('categoryId');
    return typeof raw === 'string' ? raw : null;
  })();

  if (!(fileEntry instanceof File)) {
    return NextResponse.json({ error: 'Invalid file payload.' }, { status: 400 });
  }

  if (fileEntry.size === 0) {
    return NextResponse.json({ error: 'File is empty.' }, { status: 400 });
  }

  if (fileEntry.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: 'File exceeds the maximum allowed size of 50MB.' }, { status: 413 });
  }

  const incomingType = determineIncomingType(fileEntry);

  if (!incomingType) {
    return NextResponse.json(
      { error: 'Unsupported file type. Upload JPG, PNG, WebP, or AVIF images.' },
      { status: 415 },
    );
  }

  const arrayBuffer = await fileEntry.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Process with sharp: normally downscale; for high-res categories keep original size within 10MB budget.
  // If sharp fails (e.g. missing native bindings), gracefully fall back to uploading the original buffer.
  let processed: Buffer;
  let storeAsWebp = true;

  try {
    const base = sharp(buffer, { limitInputPixels: 10000 * 10000 }).rotate();
    const meta = await base.metadata().catch(() => ({} as sharp.Metadata));
    const isHiRes = await isHighResCategory(categoryId);

    if (!isHiRes) {
      processed = await encodeWebp(buffer, { maxEdge: MAX_EDGE_PX, quality: WEBP_QUALITY });
      const px = (meta.width ?? 0) * (meta.height ?? 0);
      const largePhoto = (meta.width ?? 0) > 1200 || (meta.height ?? 0) > 1200 || px > 1_000_000;
      if (processed.length < MIN_MASTER_BYTES && largePhoto) {
        processed = await encodeWebp(buffer, { maxEdge: MAX_EDGE_PX, quality: Math.min(90, WEBP_QUALITY + 8) });
        if (processed.length < MIN_MASTER_BYTES) {
          processed = await encodeWebp(buffer, { maxEdge: MAX_EDGE_PX, quality: Math.min(92, WEBP_QUALITY + 10) });
        }
      }
    } else {
      const TEN_MB = 10 * 1024 * 1024;
      let q = Math.min(90, Math.max(75, WEBP_QUALITY + 3));
      const encodeFull = async (quality: number, edge?: number) =>
        sharp(buffer, { limitInputPixels: 10000 * 10000 })
          .rotate()
          .resize(edge ? { width: edge, height: edge, fit: 'inside', withoutEnlargement: true } : undefined)
          .webp({ quality: Math.max(60, Math.min(95, Math.round(quality))), effort: 5 })
          .toBuffer();

      processed = await encodeFull(q);
      while (processed.length > TEN_MB && q > 60) {
        q -= 5;
        processed = await encodeFull(q);
      }
      if (processed.length > TEN_MB) {
        let edge = Math.max(meta.width ?? 0, meta.height ?? 0);
        if (!edge || !Number.isFinite(edge)) edge = MAX_EDGE_PX * 2;
        while (processed.length > TEN_MB && edge > 1800) {
          edge = Math.round(edge * 0.85);
          processed = await encodeFull(q, edge);
        }
        if (processed.length > TEN_MB) {
          processed = await encodeFull(Math.max(60, q - 5), Math.min(edge, 1800));
        }
      }
    }
  } catch (err) {
    console.error('Image processing failed, falling back to original buffer', err);
    processed = buffer;
    storeAsWebp = false;
  }

  const { extension, contentType } = (() => {
    if (storeAsWebp) {
      return { extension: 'webp', contentType: 'image/webp' };
    }
    switch (incomingType) {
      case 'jpg':
        return { extension: 'jpg', contentType: 'image/jpeg' };
      case 'png':
        return { extension: 'png', contentType: 'image/png' };
      case 'webp':
        return { extension: 'webp', contentType: 'image/webp' };
      case 'avif':
        return { extension: 'avif', contentType: 'image/avif' };
      default:
        return { extension: 'bin', contentType: 'application/octet-stream' };
    }
  })();

  const fileName = `${Date.now()}-${randomUUID()}.${extension}`;
  const filePath = `${user.id}/${fileName}`;

  let { error } = await uploadToBucketOnce(filePath, processed, {
    contentType,
    upsert: false,
    cacheControl: '31536000',
  });

  if (isBucketMissingError(error)) {
    console.warn('Bucket missing during upload attempt, retrying after ensuring bucket exists');
    bucketInitialization = null;

    try {
      await ensureStorageBucket();
    } catch (retryError) {
      console.error('Failed to initialize storage bucket during retry', retryError);
      return NextResponse.json({ error: 'Storage bucket is not configured.' }, { status: 500 });
    }

    ({ error } = await uploadToBucketOnce(filePath, processed, {
      contentType,
      upsert: false,
      cacheControl: '31536000',
    }));
  }

  if (error) {
    console.error('Failed to upload file to Supabase storage', error);
    return NextResponse.json({ error: error.message ?? 'Unknown storage error.' }, { status: 400 });
  }

  const { data: signedData, error: signedError } = await supabaseAdmin
    .storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(filePath, 60 * 60);

  if (signedError) {
    console.error('Failed to create signed URL for uploaded image', signedError);
    return NextResponse.json({ error: 'Upload succeeded but preview URL could not be generated.' }, { status: 500 });
  }

  return NextResponse.json({ path: filePath, signedUrl: signedData?.signedUrl ?? null });
});

export const DELETE = withSentryRoute(async (request: Request) => {
  const originHeader = request.headers.get('origin');
  if (originHeader && !isOriginAllowed(originHeader, uploadOriginAllowList)) {
    return NextResponse.json({ error: 'Origin is not allowed to perform deletions.' }, { status: 403 });
  }

  const clientIdentifier = getClientIdentifier(request.headers);
  if (clientIdentifier !== 'unknown') {
    const ipRate = checkRateLimit(`upload-delete:ip:${clientIdentifier}`, DELETE_RATE_LIMIT_PER_IP);
    if (!ipRate.success) {
      return tooManyRequestsResponse(ipRate.retryAfter, 'Too many delete attempts from this network. Please try again later.');
    }
  }

  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const userRate = checkRateLimit(`upload-delete:user:${user.id}`, DELETE_RATE_LIMIT_PER_USER);
  if (!userRate.success) {
    return tooManyRequestsResponse(userRate.retryAfter, 'Delete rate limit reached. Please wait and retry.');
  }

  try {
    await ensureStorageBucket();
  } catch (error) {
    console.error('Failed to initialize storage bucket', error);
    return NextResponse.json({ error: 'Storage bucket is not configured.' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const path = searchParams.get('path');

  if (!path) {
    return NextResponse.json({ error: 'Missing file path.' }, { status: 400 });
  }

  const { error } = await supabaseAdmin.storage.from(STORAGE_BUCKET).remove([path]);

  if (error) {
    console.error('Failed to delete file from Supabase storage', error);
    return NextResponse.json({ error: error.message ?? 'Unknown storage error.' }, { status: 400 });
  }

  return NextResponse.json({ success: true });
});

