"use client"

import { useRef } from "react"
import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"

export function Toaster() {
  const { toasts, dismiss } = useToast()
  const pointerStartRef = useRef(new Map<string, { x: number; y: number }>())
  const SWIPE_DISMISS_THRESHOLD = 60

  return (
    <ToastProvider swipeDirection="right">
      {toasts.map(function ({ id, title, description, action, ...props }) {
        const {
          onPointerDown: toastPointerDown,
          onPointerUp: toastPointerUp,
          onPointerCancel: toastPointerCancel,
          ...restProps
        } = props

        return (
          <Toast
            key={id}
            {...restProps}
            onPointerDown={(event) => {
              toastPointerDown?.(event)
              pointerStartRef.current.set(id, { x: event.clientX, y: event.clientY })
            }}
            onPointerUp={(event) => {
              toastPointerUp?.(event)
              const start = pointerStartRef.current.get(id)
              pointerStartRef.current.delete(id)
              if (!start) return
              const dx = event.clientX - start.x
              const dy = event.clientY - start.y
              if (Math.abs(dx) > SWIPE_DISMISS_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.2) {
                dismiss(id)
              }
            }}
            onPointerCancel={(event) => {
              toastPointerCancel?.(event)
              pointerStartRef.current.delete(id)
            }}
          >
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
