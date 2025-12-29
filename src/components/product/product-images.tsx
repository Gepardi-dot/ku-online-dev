"use client";

import { useState, useCallback, useRef, useEffect, type ReactNode } from 'react';
import Image from 'next/image';
import { Eye, MapPin, Maximize2, Tag, X, ZoomIn, ZoomOut } from 'lucide-react';
import { Dialog, DialogContent, DialogClose, DialogTitle } from '@/components/ui/dialog';
import { transformSignedImageUrl } from '@/lib/storage-transform';
import FavoriteToggle, { favoritesEvents } from '@/components/product/favorite-toggle';
import ShareButton from '@/components/share-button';
import { useLocale } from '@/providers/locale-provider';
import { CurrencyText } from '@/components/currency-text';
import { getNumberLocale } from '@/lib/locale/formatting';

type ProductImagesProps = {
  images: string[];
  title: string;
  description?: string;
  price?: number | null;
  currency?: string | null;
  condition?: string | null;
  location?: string | null;
  views?: number | null;
  isSold?: boolean;
  sellerName?: string | null;
  productId: string;
  viewerId: string | null;
  initialFavoriteCount: number;
  shareUrl: string;
};

export default function ProductImages({
  images,
  title,
  description,
  price,
  currency,
  condition,
  location,
  views,
  isSold,
  sellerName,
  productId,
  viewerId,
  initialFavoriteCount,
  shareUrl,
}: ProductImagesProps) {
  const { t, locale, messages } = useLocale();
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
  const [isMobileView, setIsMobileView] = useState(false);

  const cursorRef = useRef<HTMLDivElement>(null);
  const [showCursor, setShowCursor] = useState(false);
  const [isOverButtons, setIsOverButtons] = useState(false);

  const imagesMain = variants.map((v) => v.main);

  const numberLocale = getNumberLocale(locale);
  const formatNumber = (value: number) => new Intl.NumberFormat(numberLocale).format(value);
  const priceDisplay = (
    <CurrencyText
      amount={price ?? null}
      currencyCode={currency ?? null}
      locale={locale}
      dir="auto"
      className="text-lg font-bold text-primary bidi-auto"
    />
  );

  const conditionLabels: Record<string, string> = {
    new: t('filters.conditionNew'),
    'used - like new': t('filters.conditionLikeNew'),
    'used - good': t('filters.conditionGood'),
    'used - fair': t('filters.conditionFair'),
  };
  const conditionLabel = (() => {
    const raw = (condition ?? '').trim();
    if (!raw) return null;
    const normalized = raw.toLowerCase();
    return conditionLabels[normalized] ?? raw;
  })();

  const cityLabels = messages.header.city as Record<string, string>;
  const locationLabel = (() => {
    const raw = (location ?? '').trim();
    if (!raw) return null;
    const normalized = raw.toLowerCase();
    return cityLabels[normalized] ?? raw;
  })();

  const viewsLabel = typeof views === 'number' && Number.isFinite(views) ? `${formatNumber(views)} ${t('product.viewsLabel')}` : null;
  const normalizedSellerName = typeof sellerName === 'string' ? sellerName.trim() : '';

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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(max-width: 1024px), (pointer: coarse), (hover: none)');
    const update = () => setIsMobileView(media.matches);
    update();
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  const hasGallery = variants.length > 1;

  const handleHeroMouseMove: React.MouseEventHandler<HTMLDivElement> = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width && rect.height) {
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      
      if (cursorRef.current) {
        cursorRef.current.style.transform = `translate(${x}px, ${y}px)`;
      }

      if (inlineZoomed) {
        const xPct = (x / rect.width) * 100;
        const yPct = (y / rect.height) * 100;
        const clampedX = Math.min(100, Math.max(0, xPct));
        const clampedY = Math.min(100, Math.max(0, yPct));
        setZoomOrigin({ x: clampedX, y: clampedY });
      }
    }
  };

  const handleHeroClick: React.MouseEventHandler<HTMLDivElement> = (event) => {
    if (isMobileView) {
      openAt(activeIndex);
      return;
    }
    if (!inlineZoomed) {
      // Initialize zoom origin on click if needed, though mouse move usually handles it
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
        className={`relative w-full rounded-lg overflow-hidden bg-white min-h-[260px] sm:min-h-[360px] md:min-h-[420px] max-h-[75vh] group ${hasGallery ? 'lg:order-2' : ''}`}
        style={{ cursor: isMobileView ? undefined : 'none' }}
        onClick={handleHeroClick}
        onMouseMove={handleHeroMouseMove}
        onMouseEnter={() => setShowCursor(true)}
        onMouseLeave={() => setShowCursor(false)}
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

        {showCursor && !isMobileView && !isOverButtons && (
          <div
            ref={cursorRef}
            className="pointer-events-none absolute left-0 top-0 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center text-white mix-blend-difference"
          >
            {inlineZoomed ? (
              <ZoomOut className="h-10 w-10" strokeWidth={1.5} />
            ) : (
              <ZoomIn className="h-10 w-10" strokeWidth={1.5} />
            )}
          </div>
        )}

        {/* Action buttons - hide custom cursor when hovering here */}
        <div
          className="absolute top-3 right-3 flex flex-col items-end gap-2 lg:flex-row lg:items-center z-30"
          onMouseEnter={() => setIsOverButtons(true)}
          onMouseLeave={() => setIsOverButtons(false)}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="hidden lg:inline-flex h-9 w-9 items-center justify-center rounded-full bg-secondary/90 text-gray-700 shadow-sm transition opacity-0 group-hover:opacity-100 hover:bg-secondary"
            style={{ cursor: 'pointer' }}
            onClick={(e) => {
              e.stopPropagation();
              openAt(activeIndex);
            }}
            aria-label="View full size"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <div 
            className="inline-flex items-center gap-2 rounded-full bg-secondary/90 px-3 py-1 shadow-sm text-xs text-gray-700"
            style={{ cursor: 'pointer' }}
          >
            <FavoriteToggle productId={productId} userId={viewerId} size="sm" className="h-7 w-7" />
            <span className="text-sm font-medium">{formatFavoriteCount(favoriteCount)}</span>
          </div>
          <ShareButton
            title={title}
            url={shareUrl}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-secondary/90 text-gray-700 shadow-sm hover:bg-secondary cursor-pointer"
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

      <Lightbox
        images={imagesMain}
        thumbs={variants.map((variant) => variant.thumb)}
        index={index}
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={description ?? ''}
        price={priceDisplay}
        condition={conditionLabel}
        location={locationLabel}
        views={viewsLabel}
        isSold={Boolean(isSold)}
        sellerName={normalizedSellerName || null}
        soldBadgeLabel={t('product.soldBadge')}
        descriptionTitle={t('product.descriptionTitle')}
        photosTitle={t('product.photosTitle')}
      />
    </div>
  );
}

type LightboxProps = {
  images: string[];
  thumbs: string[];
  index: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: string;
  price: ReactNode;
  condition: string | null;
  location: string | null;
  views: string | null;
  isSold: boolean;
  sellerName: string | null;
  soldBadgeLabel: string;
  descriptionTitle: string;
  photosTitle: string;
};

function Lightbox({
  images,
  thumbs,
  index,
  open,
  onOpenChange,
  title,
  description,
  price,
  condition,
  location,
  views,
  isSold,
  sellerName,
  soldBadgeLabel,
  descriptionTitle,
  photosTitle,
}: LightboxProps) {
  const [current, setCurrent] = useState(index);
  const [transform, setTransform] = useState({ scale: 1, tx: 0, ty: 0 });
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStartDistanceRef = useRef<number | null>(null);
  const pinchStartScaleRef = useRef(1);
  const scaleRef = useRef(1);
  const txRef = useRef(0);
  const tyRef = useRef(0);
  const targetScaleRef = useRef(1);
  const rafRef = useRef<number | null>(null);
  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

  const scheduleRender = useCallback((smoothScale: boolean) => {
    if (rafRef.current !== null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      if (smoothScale) {
        const target = targetScaleRef.current;
        const currentScale = scaleRef.current;
        const nextScale =
          Math.abs(target - currentScale) < 0.002
            ? target
            : currentScale + (target - currentScale) * 0.35;
        scaleRef.current = nextScale;
      }

      setTransform({
        scale: scaleRef.current,
        tx: txRef.current,
        ty: tyRef.current,
      });

      if (smoothScale && Math.abs(targetScaleRef.current - scaleRef.current) >= 0.002) {
        scheduleRender(true);
      }
    });
  }, []);

  const setTransformImmediate = useCallback((nextScale: number, nextTx = 0, nextTy = 0) => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    scaleRef.current = nextScale;
    targetScaleRef.current = nextScale;
    txRef.current = nextTx;
    tyRef.current = nextTy;
    setTransform({ scale: nextScale, tx: nextTx, ty: nextTy });
  }, []);

  const resetZoom = useCallback(() => {
    pinchStartDistanceRef.current = null;
    setTransformImmediate(1, 0, 0);
  }, [setTransformImmediate]);

  const setTargetScale = useCallback(
    (nextScale: number) => {
      targetScaleRef.current = nextScale;
      scheduleRender(true);
    },
    [scheduleRender],
  );

  const setPan = useCallback(
    (nextTx: number, nextTy: number) => {
      txRef.current = nextTx;
      tyRef.current = nextTy;
      scheduleRender(false);
    },
    [scheduleRender],
  );

  const handleOpenChange = useCallback(
    (v: boolean) => {
      onOpenChange(v);
      if (!v) resetZoom();
    },
    [onOpenChange, resetZoom],
  );
  const closeLightbox = useCallback(() => {
    pointers.current.clear();
    handleOpenChange(false);
  }, [handleOpenChange]);

  const selectImage = useCallback(
    (nextIndex: number) => {
      setCurrent(nextIndex);
      resetZoom();
    },
    [resetZoom],
  );

  const isInteractiveTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest('button, a, input, textarea, select, [role="button"]'));
  };

  useEffect(() => {
    setCurrent(index);
    resetZoom();
  }, [index, resetZoom]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const onPrev = useCallback(() => {
    setCurrent((c) => (c > 0 ? c - 1 : images.length - 1));
    resetZoom();
  }, [images.length, resetZoom]);
  const onNext = useCallback(() => {
    setCurrent((c) => (c + 1) % images.length);
    resetZoom();
  }, [images.length, resetZoom]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        onPrev();
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        onNext();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onNext, onPrev, open]);

  const onWheel: React.WheelEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.001;
    const nextScale = clamp(targetScaleRef.current + delta, 1, 4);
    setTargetScale(nextScale);
  };

  const onPointerDown: React.PointerEventHandler<HTMLDivElement> = (e) => {
    if (isInteractiveTarget(e.target)) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const pts = Array.from(pointers.current.values());
      pinchStartDistanceRef.current = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchStartScaleRef.current = scaleRef.current;
    }
  };
  const onPointerUp: React.PointerEventHandler<HTMLDivElement> = (e) => {
    if (isInteractiveTarget(e.target)) return;
    if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    }
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) {
      pinchStartDistanceRef.current = null;
    }
    if (pointers.current.size === 0 && scaleRef.current < 1.02) resetZoom();
  };
  const onPointerMove: React.PointerEventHandler<HTMLDivElement> = (e) => {
    if (isInteractiveTarget(e.target)) return;
    if (!pointers.current.has(e.pointerId)) return;
    const prev = pointers.current.get(e.pointerId)!;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 1) {
      // Pan
      setPan(txRef.current + (e.clientX - prev.x), tyRef.current + (e.clientY - prev.y));
    } else if (pointers.current.size === 2) {
      // Pinch
      const pts = Array.from(pointers.current.values());
      if (pts.length !== 2) return;
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (pinchStartDistanceRef.current === null || pinchStartDistanceRef.current <= 0) {
        pinchStartDistanceRef.current = dist;
        pinchStartScaleRef.current = scaleRef.current;
      }
      const nextScale = clamp(
        pinchStartScaleRef.current * (dist / pinchStartDistanceRef.current),
        1,
        4,
      );
      setTargetScale(nextScale);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
    >
      <DialogContent className="inset-0 left-0 top-0 translate-x-0 translate-y-0 max-w-none w-screen h-[100dvh] border-0 bg-white/10 p-0 shadow-none backdrop-blur-3xl">
        <DialogTitle className="sr-only">
          {title ? `${title} image ${current + 1} of ${images.length}` : 'Product image viewer'}
        </DialogTitle>

        <div className="relative flex h-full w-full flex-col p-3 md:p-6">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <div className="absolute -top-24 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
            <div className="absolute bottom-[-9rem] right-[-9rem] h-96 w-96 rounded-full bg-orange-200/25 blur-3xl" />
          </div>

          <div className="relative mx-auto flex h-full w-full max-w-7xl flex-col overflow-hidden rounded-[28px] border border-white/60 bg-white/70 shadow-[0_30px_90px_rgba(15,23,42,0.25)] ring-1 ring-white/30 backdrop-blur-2xl lg:flex-row">
            <div className="relative flex-1 bg-gradient-to-br from-white/65 via-white/55 to-white/40">
              <div className="absolute inset-0">
                <div
                  className="relative h-full w-full select-none touch-none"
                  style={{ touchAction: 'none' }}
                  onWheel={onWheel}
                  onPointerDown={onPointerDown}
                  onPointerUp={onPointerUp}
                  onPointerMove={onPointerMove}
                >
                  <button
                    type="button"
                    className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full border border-[#f97316]/60 bg-[#f97316] p-2 text-white shadow-[0_10px_24px_rgba(249,115,22,0.35)] transition hover:bg-[#ea580c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316]/40"
                    onClick={onPrev}
                    aria-label="Previous"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full border border-[#f97316]/60 bg-[#f97316] p-2 text-white shadow-[0_10px_24px_rgba(249,115,22,0.35)] transition hover:bg-[#ea580c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316]/40"
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
                      sizes="(max-width: 1024px) 100vw, 70vw"
                      className="object-contain will-change-transform"
                      style={{
                        transform: `translate3d(${transform.tx}px, ${transform.ty}px, 0) scale(${transform.scale})`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <aside
              className={[
                'flex w-full flex-col border-t border-white/60 bg-white/75 backdrop-blur-2xl',
                'max-h-[42dvh] overflow-y-auto',
                'lg:w-[420px] lg:shrink-0 lg:max-h-none lg:overflow-visible lg:border-t-0 lg:border-l',
              ].join(' ')}
            >
              <div className="flex items-start justify-between gap-3 p-4 pb-0">
                <div className="min-w-0">
                  <h2 dir="auto" className="truncate text-base font-bold text-slate-900">
                    {title}
                  </h2>
                  <p className="mt-1 text-xs font-medium text-slate-500">
                    {current + 1} / {images.length}
                  </p>
                </div>
                <DialogClose asChild>
                  <button
                    type="button"
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200/80 bg-white text-slate-900 shadow-[0_14px_28px_rgba(15,23,42,0.18)] transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316]/40"
                    aria-label="Close"
                    onClick={(event) => {
                      event.stopPropagation();
                      closeLightbox();
                    }}
                  >
                    <X className="h-5 w-5" />
                  </button>
                </DialogClose>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-2 p-4 pt-3 sm:gap-3">
                <div className="shrink-0 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-none">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4 text-primary" aria-hidden="true" />
                      {price}
                      {isSold ? (
                        <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                          {soldBadgeLabel}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-700">
                      {condition ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                          {condition}
                        </span>
                      ) : null}
                      {location ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-sky-50 px-2.5 py-1 text-sky-700">
                          <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                          <span dir="auto" className="bidi-auto">{location}</span>
                        </span>
                      ) : null}
                      {views ? (
                        <span
                          dir="auto"
                          className="inline-flex items-center gap-1 rounded-full border border-amber-200/80 bg-amber-50 px-2.5 py-1 text-amber-700 bidi-auto"
                        >
                          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                          {views}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {sellerName ? (
                    <p className="mt-2 text-sm font-medium text-slate-600" dir="auto">
                      {sellerName}
                    </p>
                  ) : null}
                </div>

                {images.length > 1 && (
                  <div className="shrink-0 rounded-2xl border border-white/70 bg-white/60 p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-slate-900">{photosTitle}</h3>
                      <span className="text-xs font-medium text-slate-500">
                        {images.length}
                      </span>
                    </div>
                    <div className="mt-2 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                      {thumbs.map((src, i) => (
                        <button
                          key={`${src}-${i}`}
                          type="button"
                          className={[
                            'relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border bg-white/60 shadow-sm transition lg:h-16 lg:w-16',
                            i === current ? 'border-primary ring-2 ring-primary/25' : 'border-white/70 hover:border-primary/50',
                          ].join(' ')}
                          onClick={() => selectImage(i)}
                          aria-label={`Select image ${i + 1}`}
                        >
                          <Image src={src} alt={`${title} ${i + 1}`} fill sizes="(max-width: 1024px) 80px, 64px" className="object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </aside>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
