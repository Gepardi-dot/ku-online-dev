"use client";

import type { HTMLAttributes } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

type BrandLogoProps = HTMLAttributes<HTMLDivElement> & {
  size?: number; // square size in px
  src?: string; // override path if needed
};

export default function BrandLogo({
  className,
  size = 36,
  src = "/optimized/brand/ku-logo-256.webp",
  ...rest
}: BrandLogoProps) {
  const resolvedSrc = src.trim().length > 0 ? src.trim() : "/optimized/brand/ku-logo-256.webp";

  return (
    <div className={cn("relative", className)} style={{ width: size, height: size }} {...rest}>
      <Image
        src={resolvedSrc}
        alt="KU BAZAR logo"
        width={size}
        height={size}
        sizes={`${size}px`}
        priority={size >= 36}
        quality={90}
        className="h-full w-full object-contain"
        style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
        aria-hidden={false}
      />
    </div>
  );
}
