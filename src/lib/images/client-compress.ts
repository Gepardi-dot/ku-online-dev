'use client';

// Lightweight client-side compression to reduce upload payloads.
// Converts images to WebP, max edge 1280px, quality ~0.72 by default.

export type CompressOptions = {
  maxEdge?: number;
  quality?: number; // 0..1
};

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window && typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file);
      return bmp as unknown as ImageBitmap;
    } catch {}
  }

  // Fallback to HTMLImageElement
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });
    return img;
  } finally {
    // URL will be revoked after drawing
  }
}

export async function compressToWebp(file: File, opts: CompressOptions = {}): Promise<Blob> {
  // Default to higher quality/larger master to preserve detail; server will still recompress if needed
  const maxEdge = Number.isFinite(opts.maxEdge as number) ? (opts.maxEdge as number) : 1600;
  const quality = typeof opts.quality === 'number' ? Math.min(1, Math.max(0.1, opts.quality)) : 0.82;

  const source = await loadBitmap(file);
  const sw = 'width' in source ? (source as any).width : (source as HTMLImageElement).naturalWidth;
  const sh = 'height' in source ? (source as any).height : (source as HTMLImageElement).naturalHeight;

  // Determine target size preserving aspect ratio
  const scale = Math.min(1, maxEdge / Math.max(sw, sh));
  const tw = Math.max(1, Math.round(sw * scale));
  const th = Math.max(1, Math.round(sh * scale));

  const canvas = document.createElement('canvas');
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unsupported');

  // Draw with high quality where supported
  (ctx as any).imageSmoothingQuality = 'high';
  ctx.drawImage(source as any, 0, 0, tw, th);

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/webp', quality);
  });

  // Cleanup ImageBitmap if used
  if ('close' in source && typeof (source as any).close === 'function') {
    try { (source as any).close(); } catch {}
  }
  return blob;
}
