"use client";

import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type BrandLogoProps = HTMLAttributes<HTMLDivElement> & {
  size?: number; // square size in px
  src?: string; // override path if needed
};

export default function BrandLogo({ className, size = 36, src = "/KU-LOGO.png", ...rest }: BrandLogoProps) {
  const resolvedSrc = src.trim().length > 0 ? src.trim() : "/KU-LOGO.png";

  return (
    <div className={cn("relative", className)} style={{ width: size, height: size }} {...rest}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={resolvedSrc}
        alt="KU BAZAR logo"
        loading={size >= 36 ? "eager" : "lazy"}
        decoding="async"
        className="h-full w-full object-contain"
        style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
        aria-hidden={false}
      />
    </div>
  );
}
