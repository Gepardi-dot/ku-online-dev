"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface SwipeHintProps {
  children: React.ReactNode;
  containerClassName?: string;
  label?: string;
  direction?: "ltr" | "rtl";
}

export default function SwipeHint({
  children,
  containerClassName,
  label,
  direction = "ltr",
}: SwipeHintProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [showHint, setShowHint] = useState(false);
  const hintVisibleRef = useRef(showHint);
  const hasInteractedRef = useRef(false);

  useEffect(() => {
    hintVisibleRef.current = showHint;
  }, [showHint]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const node = containerRef.current;
    if (!node) return;

    hasInteractedRef.current = false;

    let initialScrollLeft = node.scrollLeft;

    const evaluateOverflow = () => {
      if (hasInteractedRef.current) {
        setShowHint(false);
        return;
      }
      const needsSwipe = node.scrollWidth - node.clientWidth > 12;
      setShowHint(needsSwipe);
      initialScrollLeft = node.scrollLeft;
    };

    evaluateOverflow();

    const handleScroll = () => {
      if (!hintVisibleRef.current) return;
      if (Math.abs(node.scrollLeft - initialScrollLeft) > 12) {
        hasInteractedRef.current = true;
        setShowHint(false);
      }
    };

    const dismissHint = () => {
      hasInteractedRef.current = true;
      if (hintVisibleRef.current) {
        setShowHint(false);
      }
    };

    node.addEventListener("scroll", handleScroll, { passive: true });
    node.addEventListener("pointerdown", dismissHint, { passive: true });
    node.addEventListener("touchstart", dismissHint, { passive: true });

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => {
        evaluateOverflow();
      });
      observer.observe(node);
    }

    return () => {
      node.removeEventListener("scroll", handleScroll);
      node.removeEventListener("pointerdown", dismissHint);
      node.removeEventListener("touchstart", dismissHint);
      observer?.disconnect();
    };
  }, [direction]);

  const isRtl = direction === "rtl";
  const HintArrow = isRtl ? ArrowLeft : ArrowRight;

  return (
    <div className="relative">
      <div ref={containerRef} className={cn(containerClassName)} dir={direction}>
        {children}
      </div>
      {showHint ? (
        <div
          className={cn(
            "pointer-events-none absolute inset-y-0 flex items-center lg:hidden",
            isRtl ? "left-2" : "right-2",
          )}
        >
          <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-1 text-[11px] font-semibold text-primary shadow-md ring-1 ring-primary/40 animate-pulse">
            <span>{label ?? "Swipe"}</span>
            <HintArrow className="h-3.5 w-3.5" />
          </span>
        </div>
      ) : null}
    </div>
  );
}
