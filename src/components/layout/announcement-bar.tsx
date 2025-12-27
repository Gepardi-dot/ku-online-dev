"use client"

import { cn } from "@/lib/utils"
import { useLocale } from "@/providers/locale-provider"

type MarqueeProps = React.HTMLAttributes<HTMLDivElement> & {
  reverse?: boolean;
};

const Marquee = ({ className, reverse, children, ...props }: MarqueeProps) => {
  return (
    <div
      {...props}
      className={cn(
        "group flex overflow-hidden p-2 [--duration:40s] [--gap:1rem] [gap:var(--gap)]",
        className
      )}
    >
      <div
        className={cn("flex min-w-full shrink-0 animate-marquee items-center [gap:var(--gap)]", {
          "[animation-direction:reverse]": reverse,
        })}
      >
        {children}
      </div>
      <div
        className={cn("flex min-w-full shrink-0 animate-marquee items-center [gap:var(--gap)]", {
          "[animation-direction:reverse]": reverse,
        })}
        aria-hidden="true"
      >
        {children}
      </div>
    </div>
  )
}

export function AnnouncementBar() {
  const { t } = useLocale()
  const tagline = t("announcement.tagline")

  return (
    <div
      className="relative z-[70] bg-primary text-primary-foreground pointer-events-none"
      data-announcement-bar
    >
      <div className="px-3 py-2 text-center text-xs font-semibold md:hidden" dir="auto">
        <span className="whitespace-nowrap">{tagline}</span>
      </div>
      <Marquee className="hidden text-sm font-medium md:flex" dir="auto">
        {Array.from({ length: 4 }).map((_, index) => (
          <span className="mx-4 whitespace-nowrap" key={index}>
            {tagline}
          </span>
        ))}
      </Marquee>
    </div>
  )
}
