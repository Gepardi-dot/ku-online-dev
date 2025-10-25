import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { createClient as createServerClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STORAGE_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ?? 'product-images';

const ACCEPTED_FILE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'avif'];
const ACCEPTED_FILE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Supabase URL or anon key is not configured.');
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY must be set to enable media uploads.');
}

const supabaseAdmin = createAdminClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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
      // If the bucket already exists, fall through to the update logic below.
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

function determineExtension(file: File): string | null {
  const nameExtension = file.name.split('.').pop()?.toLowerCase();

  if (nameExtension && ACCEPTED_FILE_EXTENSIONS.includes(nameExtension)) {
    return nameExtension === 'jpeg' ? 'jpg' : nameExtension;
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

function resolveContentType(file: File, extension: string) {
  if (file.type && ACCEPTED_FILE_MIME_TYPES.includes(file.type)) {
    return file.type;
  }

  if (extension === 'jpg') {
    return 'image/jpeg';
  }

  return `image/${extension}`;
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  try {
    await ensureStorageBucket();
  } catch (error) {
    console.error('Failed to initialize storage bucket', error);
    return NextResponse.json({ error: 'Storage bucket is not configured.' }, { status: 500 });
  }

  const formData = await request.formData();
  const fileEntry = formData.get('file');

  if (!(fileEntry instanceof File)) {
    return NextResponse.json({ error: 'Invalid file payload.' }, { status: 400 });
  }

  const extension = determineExtension(fileEntry);

  if (!extension) {
    return NextResponse.json(
      { error: 'Unsupported file type. Upload JPG, PNG, WebP, or AVIF images.' },
      { status: 415 },
    );
  }

  const arrayBuffer = await fileEntry.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const fileName = `${Date.now()}-${randomUUID()}.${extension}`;
  const filePath = `${user.id}/${fileName}`;

  const contentType = resolveContentType(fileEntry, extension);

  let { error } = await uploadToBucketOnce(filePath, buffer, {
    contentType,
    upsert: false,
    cacheControl: '3600',
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

    ({ error } = await uploadToBucketOnce(filePath, buffer, {
      contentType,
      upsert: false,
      cacheControl: '3600',
    }));
  }

  if (error) {
    console.error('Failed to upload file to Supabase storage', error);
    return NextResponse.json({ error: error.message ?? 'Unknown storage error.' }, { status: 400 });
  }

  const { data } = supabaseAdmin.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);

  return NextResponse.json({ path: filePath, publicUrl: data.publicUrl });
}

export async function DELETE(request: Request) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
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

  if (!path.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: 'You are not allowed to delete this file.' }, { status: 403 });
  }

  let { error } = await supabaseAdmin.storage.from(STORAGE_BUCKET).remove([path]);

  if (isBucketMissingError(error)) {
    console.warn('Bucket missing during delete attempt, retrying after ensuring bucket exists');
    bucketInitialization = null;

    try {
      await ensureStorageBucket();
    } catch (retryError) {
      console.error('Failed to initialize storage bucket during delete retry', retryError);
      return NextResponse.json({ error: 'Storage bucket is not configured.' }, { status: 500 });
    }

    ({ error } = await supabaseAdmin.storage.from(STORAGE_BUCKET).remove([path]));
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
