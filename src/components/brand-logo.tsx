"use client";

import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type BrandLogoProps = HTMLAttributes<HTMLDivElement> & {
  size?: number; // square size in px
  src?: string; // override path if needed
};

export default function BrandLogo({ className, size = 36, src = "/KU-LOGO.png", ...rest }: BrandLogoProps) {
  // Expects the PNG to be placed at `public/KU-LOGO.png`.
  // Uses object-contain to keep the aspect ratio of the provided artwork.
  return (
    <div className={cn("relative", className)} style={{ width: size, height: size }} {...rest}>
      {/* Use a plain img to avoid Next/Image domain allowlist issues and ensure the exact PNG renders */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={process.env.NEXT_PUBLIC_LOGO_URL || src}
        alt="KU BAZAR logo"
        style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
        aria-hidden={false}
      />
    </div>
  );
}

