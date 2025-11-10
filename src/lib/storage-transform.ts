// Pure URL transformer for Supabase signed URLs usable in client bundles
// Does not import server-only env or create admin clients.

export function transformSignedImageUrl(
  signedUrl: string | null | undefined,
  options: {
    width?: number;
    height?: number;
    resize?: 'contain' | 'cover' | 'fill' | 'inside' | 'outside';
    quality?: number;
    format?: 'webp' | 'png' | 'jpeg';
  } = {},
): string | null {
  if (!signedUrl || typeof signedUrl !== 'string') return null;
  if (!signedUrl.includes('/storage/v1/object/sign/')) {
    // Non-Supabase or public URL; return as-is
    return signedUrl;
  }
  try {
    const url = new URL(signedUrl);
    url.pathname = url.pathname.replace('/storage/v1/object/sign/', '/storage/v1/render/image/sign/');
    if (options.width && Number.isFinite(options.width)) url.searchParams.set('width', String(options.width));
    if (options.height && Number.isFinite(options.height)) url.searchParams.set('height', String(options.height));
    url.searchParams.set('resize', options.resize ?? 'contain');
    if (options.quality && Number.isFinite(options.quality)) url.searchParams.set('quality', String(options.quality));
    if (options.format) url.searchParams.set('format', options.format);
    return url.toString();
  } catch {
    return signedUrl;
  }
}

