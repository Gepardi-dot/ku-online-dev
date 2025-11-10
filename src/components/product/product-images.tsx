"use client";

import { useState, useCallback, useRef } from 'react';
import Image from 'next/image';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { transformSignedImageUrl } from '@/lib/storage-transform';

type ProductImagesProps = {
  images: string[];
  title: string;
};

export default function ProductImages({ images, title }: ProductImagesProps) {
  const hero = transformSignedImageUrl(images[0], { width: 1200, resize: 'contain', quality: 85, format: 'webp' }) ?? images[0];
  const gallery = images.slice(1).map((u) => transformSignedImageUrl(u, { width: 800, resize: 'contain', quality: 85, format: 'webp' }) ?? u);

  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  const openAt = useCallback((i: number) => {
    setIndex(i);
    setOpen(true);
  }, []);

  return (
    <div className="space-y-4">
      <div className="relative w-full rounded-lg overflow-hidden bg-white min-h-[260px] sm:min-h-[360px] md:min-h-[420px] max-h-[75vh] cursor-zoom-in" onClick={() => openAt(0)}>
        <Image src={hero} alt={title} fill sizes="100vw" className="object-contain" priority />
      </div>

      {gallery.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {gallery.map((img, i) => (
            <button key={img + i} type="button" className="relative aspect-square sm:aspect-[4/3] rounded-lg overflow-hidden bg-white cursor-zoom-in" onClick={() => openAt(i + 1)}>
              <Image src={img} alt={`${title} ${i + 2}`} fill sizes="(max-width: 640px) 33vw, 20vw" className="object-contain" />
            </button>
          ))}
        </div>
      )}

      <Lightbox images={[hero, ...gallery]} index={index} open={open} onOpenChange={setOpen} title={title} />
    </div>
  );
}

function Lightbox({ images, index, open, onOpenChange, title }: { images: string[]; index: number; open: boolean; onOpenChange: (v: boolean) => void; title: string }) {
  const [current, setCurrent] = useState(index);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());

  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

  const resetZoom = () => {
    setScale(1);
    setTx(0);
    setTy(0);
  };

  const onPrev = () => { setCurrent((c) => (c > 0 ? c - 1 : images.length - 1)); resetZoom(); };
  const onNext = () => { setCurrent((c) => (c + 1) % images.length); resetZoom(); };

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
      const [q1, q2] = pts; // approximate using current; we don't keep historical two-points distances per frame; good enough
      const dist = d(p1, p2);
      const prevDist = d({ x: p1.x - (e.clientX - prev.x), y: p1.y - (e.clientY - prev.y) }, q2);
      const delta = (dist - prevDist) / 200;
      setScale((s) => clamp(s + delta, 1, 4));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) resetZoom(); }}>
      <DialogContent className="max-w-full w-full h-[100dvh] p-0 bg-black/90 text-white">
        <div className="relative w-full h-full select-none touch-none" style={{ touchAction: 'none' }} onWheel={onWheel} onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerMove={onPointerMove}>
          <button type="button" className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2 hover:bg-white/20" onClick={onPrev} aria-label="Previous">
            ‹
          </button>
          <button type="button" className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2 hover:bg-white/20" onClick={onNext} aria-label="Next">
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
