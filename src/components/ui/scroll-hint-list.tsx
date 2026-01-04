"use client";

import * as React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { cn } from "@/lib/utils";

type ScrollHintListProps = {
  scrollClassName?: string;
} & React.HTMLAttributes<HTMLDivElement>;

const ScrollHintList = ({
  children,
  className,
  scrollClassName,
  ...props
}: ScrollHintListProps) => {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [canScrollUp, setCanScrollUp] = React.useState(false);
  const [canScrollDown, setCanScrollDown] = React.useState(false);

  const updateScrollState = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    setCanScrollUp(scrollTop > 2);
    setCanScrollDown(scrollTop + clientHeight < scrollHeight - 2);
  }, []);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollState();

    const handleScroll = () => updateScrollState();
    el.addEventListener("scroll", handleScroll, { passive: true });

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => updateScrollState());
      observer.observe(el);
    }

    return () => {
      el.removeEventListener("scroll", handleScroll);
      observer?.disconnect();
    };
  }, [updateScrollState]);

  return (
    <div className={cn("relative", className)} {...props}>
      <div ref={scrollRef} className={scrollClassName}>
        {children}
      </div>
      {canScrollUp ? (
        <div className="pointer-events-none absolute inset-x-0 top-1 flex justify-center">
          <div className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/80 text-brand shadow-sm ring-1 ring-black/10 backdrop-blur-sm">
            <ChevronUp className="h-4 w-4" />
          </div>
        </div>
      ) : null}
      {canScrollDown ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-1 flex justify-center">
          <div className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/80 text-brand shadow-sm ring-1 ring-black/10 backdrop-blur-sm">
            <ChevronDown className="h-4 w-4" />
          </div>
        </div>
      ) : null}
    </div>
  );
};

export { ScrollHintList };
