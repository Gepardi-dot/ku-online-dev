"use client";

import { useState, useCallback, useRef, useEffect } from 'react';
import Image from 'next/image';
import { Maximize2 } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { transformSignedImageUrl } from '@/lib/storage-transform';
import FavoriteToggle, { favoritesEvents } from '@/components/product/favorite-toggle';
import ShareButton from '@/components/share-button';

type ProductImagesProps = {
  images: string[];
  title: string;
  productId: string;
  viewerId: string | null;
  initialFavoriteCount: number;
  shareUrl: string;
};

export default function ProductImages({
  images,
  title,
  productId,
  viewerId,
  initialFavoriteCount,
  shareUrl,
}: ProductImagesProps) {
  const cleaned = images
    .filter((src) => typeof src === 'string' && src.trim().length > 0)
    .map((src) => src.trim());

  const fallback = 'https://placehold.co/1200x900?text=KU-ONLINE';
  const safeImages = cleaned.length > 0 ? cleaned : [fallback];

  const variants = safeImages.map((src) => ({
    main:
      transformSignedImageUrl(src, {
        width: 1200,
        resize: 'contain',
        quality: 85,
        format: 'webp',
      }) ?? src,
    thumb:
      transformSignedImageUrl(src, {
        width: 320,
        resize: 'cover',
        quality: 75,
        format: 'webp',
      }) ?? src,
  }));

  const [activeIndex, setActiveIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [favoriteCount, setFavoriteCount] = useState(initialFavoriteCount);
  const [inlineZoomed, setInlineZoomed] = useState(false);
  const [zoomOrigin, setZoomOrigin] = useState({ x: 50, y: 50 });

  const imagesMain = variants.map((v) => v.main);

  const openAt = useCallback((i: number) => {
    setIndex(i);
    setOpen(true);
  }, []);

  useEffect(() => {
    setFavoriteCount(initialFavoriteCount);
  }, [initialFavoriteCount]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<{
        productId: string;
        delta?: number;
      }>;
      const detail = customEvent.detail;
      if (!detail || detail.productId !== productId) return;
      if (typeof detail.delta === 'number') {
        setFavoriteCount((prev) => Math.max(0, prev + detail.delta!));
      }
    };

    window.addEventListener(favoritesEvents.eventName, handler);
    return () => window.removeEventListener(favoritesEvents.eventName, handler);
  }, [productId]);

  const hasGallery = variants.length > 1;

  const handleHeroMouseMove: React.MouseEventHandler<HTMLDivElement> = (event) => {
    if (!inlineZoomed) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    const clampedX = Math.min(100, Math.max(0, x));
    const clampedY = Math.min(100, Math.max(0, y));
    setZoomOrigin({ x: clampedX, y: clampedY });
  };

  const handleHeroClick: React.MouseEventHandler<HTMLDivElement> = (event) => {
    if (!inlineZoomed) {
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width && rect.height) {
        const x = ((event.clientX - rect.left) / rect.width) * 100;
        const y = ((event.clientY - rect.top) / rect.height) * 100;
        const clampedX = Math.min(100, Math.max(0, x));
        const clampedY = Math.min(100, Math.max(0, y));
        setZoomOrigin({ x: clampedX, y: clampedY });
      }
      setInlineZoomed(true);
    } else {
      setInlineZoomed(false);
    }
  };

  const formatFavoriteCount = (count: number) => {
    if (count >= 10_000) {
      return `${Math.round(count / 1000)}K`;
    }
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}K`;
    }
    return count.toString();
  };

  return (
    <div
      className={`space-y-4 ${
        hasGallery ? 'lg:space-y-0 lg:grid lg:grid-cols-[80px,minmax(0,1fr)] lg:gap-4 lg:items-start' : ''
      }`}
    >
      {/* Hero image (desktop order second) */}
      <div
        className={`relative w-full rounded-lg overflow-hidden bg-white min-h-[260px] sm:min-h-[360px] md:min-h-[420px] max-h-[75vh] group ${
          inlineZoomed ? 'cursor-zoom-out' : 'cursor-zoom-in'
        } ${hasGallery ? 'lg:order-2' : ''}`}
        onClick={handleHeroClick}
        onMouseMove={handleHeroMouseMove}
      >
        <Image
          src={imagesMain[activeIndex]}
          alt={title}
          fill
          sizes="100vw"
          className="object-contain"
          style={{
            transform: inlineZoomed ? 'scale(2)' : 'scale(1)',
            transformOrigin: `${zoomOrigin.x}% ${zoomOrigin.y}%`,
            transition: 'transform 150ms ease-out, transform-origin 50ms linear',
          }}
          priority
        />
        <div className="absolute top-3 right-3 flex items-center gap-2">
          <button
            type="button"
            className="hidden lg:inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-gray-700 shadow-sm transition opacity-0 group-hover:opacity-100 hover:bg-white"
            onClick={(e) => {
              e.stopPropagation();
              openAt(activeIndex);
            }}
            aria-label="View full size"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <div className="inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-1 shadow-sm text-xs text-gray-700">
            <FavoriteToggle productId={productId} userId={viewerId} size="sm" className="h-7 w-7" />
            <span className="text-sm font-medium">{formatFavoriteCount(favoriteCount)}</span>
          </div>
          <ShareButton
            title={title}
            url={shareUrl}
            className="hidden lg:inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-gray-700 shadow-sm hover:bg-white"
            size="sm"
            variant="secondary"
          />
        </div>
      </div>

      {/* Thumbnails column (desktop order first, mobile below hero) */}
      {hasGallery && (
        <div className="grid grid-cols-3 gap-2 mt-4 lg:mt-0 lg:flex lg:flex-col lg:gap-2 lg:max-h-[420px] lg:overflow-y-auto lg:order-1">
          {variants.map((variant, i) => (
            <button
              key={`${variant.thumb}-${i}`}
              type="button"
              className={`relative aspect-square sm:aspect-[4/3] lg:aspect-square rounded-lg overflow-hidden bg-white cursor-pointer border ${
                i === activeIndex ? 'border-primary' : 'border-transparent hover:border-primary/60'
              }`}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => openAt(i)}
            >
              <Image
                src={variant.thumb}
                alt={`${title} ${i + 1}`}
                fill
                sizes="(max-width: 640px) 33vw, 20vw"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}

      <Lightbox images={imagesMain} index={index} open={open} onOpenChange={setOpen} title={title} />
    </div>
  );
}

type LightboxProps = {
  images: string[];
  index: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
};

function Lightbox({ images, index, open, onOpenChange, title }: LightboxProps) {
  const [current, setCurrent] = useState(index);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());

  useEffect(() => {
    setCurrent(index);
    setScale(1);
    setTx(0);
    setTy(0);
  }, [index]);

  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

  const resetZoom = () => {
    setScale(1);
    setTx(0);
    setTy(0);
  };

  const onPrev = () => {
    setCurrent((c) => (c > 0 ? c - 1 : images.length - 1));
    resetZoom();
  };
  const onNext = () => {
    setCurrent((c) => (c + 1) % images.length);
    resetZoom();
  };

  const onWheel: React.WheelEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.001;
    setScale((s) => clamp(s + delta, 1, 4));
  };

  const onPointerDown: React.PointerEventHandler<HTMLDivElement> = (e) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const onPointerUp: React.PointerEventHandler<HTMLDivElement> = (e) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0 && scale < 1.02) resetZoom();
  };
  const onPointerMove: React.PointerEventHandler<HTMLDivElement> = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    const prev = pointers.current.get(e.pointerId)!;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 1) {
      // Pan
      setTx((x) => x + (e.clientX - prev.x));
      setTy((y) => y + (e.clientY - prev.y));
    } else if (pointers.current.size === 2) {
      // Pinch
      const pts = Array.from(pointers.current.values());
      const d = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
      const [p1, p2] = pts;
      const [q1, q2] = pts;
      const dist = d(p1, p2);
      const prevDist = d({ x: p1.x - (e.clientX - prev.x), y: p1.y - (e.clientY - prev.y) }, q2);
      const delta = (dist - prevDist) / 200;
      setScale((s) => clamp(s + delta, 1, 4));
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) resetZoom();
      }}
    >
      <DialogContent className="max-w-full w-full h-[100dvh] p-0 bg-black/90 text-white">
        <div
          className="relative w-full h-full select-none touch-none"
          style={{ touchAction: 'none' }}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerMove={onPointerMove}
        >
          <button
            type="button"
            className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2 hover:bg-white/20"
            onClick={onPrev}
            aria-label="Previous"
          >
            ‹
          </button>
          <button
            type="button"
            className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2 hover:bg-white/20"
            onClick={onNext}
            aria-label="Next"
          >
            ›
          </button>
          <div className="absolute inset-0">
            <Image
              src={images[current]}
              alt={title}
              fill
              sizes="100vw"
              className="object-contain"
              style={{ transform: `translate3d(${tx}px, ${ty}px, 0) scale(${scale})` }}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
