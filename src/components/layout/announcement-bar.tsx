"use client"

import { cn } from "@/lib/utils"
import { useLocale } from "@/providers/locale-provider"
import { useEffect, useRef } from "react"

const Marquee = ({ className, reverse, children, ...props }: {
    className?: string,
    reverse?: boolean,
    children: React.ReactNode
}) => {
  return (
    <div
      {...props}
      className={cn(
        "group flex overflow-hidden p-2 [--duration:40s] [--gap:1rem] gap-(--gap)",
        className
      )}
    >
      <div
        className={cn("flex min-w-full shrink-0 animate-marquee items-center gap-(--gap)", {
          "[animation-direction:reverse]": reverse,
        })}
      >
        {children}
      </div>
      <div
        className={cn("flex min-w-full shrink-0 animate-marquee items-center gap-(--gap)", {
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
  const barRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    const bar = barRef.current
    if (!bar) return

    const updateHeight = () => {
      const height = bar.getBoundingClientRect().height
      if (!Number.isFinite(height) || height <= 0) return
      document.documentElement.style.setProperty("--announcement-bar-height", `${height}px`)
    }

    updateHeight()

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateHeight)
      return () => window.removeEventListener("resize", updateHeight)
    }

    const observer = new ResizeObserver(updateHeight)
    observer.observe(bar)
    window.addEventListener("resize", updateHeight)

    return () => {
      observer.disconnect()
      window.removeEventListener("resize", updateHeight)
    }
  }, [])

  return (
    <div
      ref={barRef}
      className="fixed top-0 left-0 right-0 z-70 bg-primary text-primary-foreground pointer-events-none"
      data-announcement-bar
      dir="ltr"
    >
      <Marquee className="text-sm font-medium font-sans">
        {Array.from({ length: 4 }).map((_, index) => (
          <span className="mx-4 whitespace-nowrap" key={index} dir="auto">
            {tagline}
          </span>
        ))}
      </Marquee>
    </div>
  )
}
