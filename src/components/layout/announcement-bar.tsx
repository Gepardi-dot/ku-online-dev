"use client"

import { cn } from "@/lib/utils"
import { useLocale } from "@/providers/locale-provider"

const Marquee = ({ className, reverse, children, ...props }: {
    className?: string,
    reverse?: boolean,
    children: React.ReactNode
}) => {
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
    <div className="bg-primary text-primary-foreground">
      <Marquee className="text-sm font-medium">
        {Array.from({ length: 4 }).map((_, index) => (
          <span className="mx-4 whitespace-nowrap" key={index}>
            {tagline}
          </span>
        ))}
      </Marquee>
    </div>
  )
}
