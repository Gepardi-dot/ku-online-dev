"use client";

import type { HTMLAttributes } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

type BrandLogoProps = HTMLAttributes<HTMLDivElement> & {
  size?: number; // layout box size in px (before CSS scale on className)
  /**
   * Approximate CSS transform scale applied by the parent (e.g. header
   * mobile scale-[2.95], desktop scale-[2.55]). Used only to set next/image
   * `sizes` to the post-scale display size so srcset is not undersampled.
   * Does not change layout or visual scale.
   */
  displayScale?: number;
  /** Override next/image sizes string if you know the exact post-scale CSS px. */
  imageSizes?: string;
  src?: string; // override path if needed
};

export default function BrandLogo({
  className,
  size = 36,
  displayScale = 3,
  imageSizes,
  src = "/optimized/brand/ku-logo-256.webp",
  ...rest
}: BrandLogoProps) {
  const resolvedSrc = src.trim().length > 0 ? src.trim() : "/optimized/brand/ku-logo-256.webp";
  // Header applies ~2.55–2.95 CSS scale on the logo wrapper; default scale 3
  // asks Next for ~size*3 CSS pixels (then devicePixelRatio via srcset).
  const resolvedSizes = imageSizes ?? `${Math.ceil(size * displayScale)}px`;

  return (
    <div className={cn("relative", className)} style={{ width: size, height: size }} {...rest}>
      <Image
        src={resolvedSrc}
        alt="KU BAZAR logo"
        width={size}
        height={size}
        sizes={resolvedSizes}
        priority={size >= 36}
        quality={90}
        className="h-full w-full object-contain"
        style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
        aria-hidden={false}
      />
    </div>
  );
}
