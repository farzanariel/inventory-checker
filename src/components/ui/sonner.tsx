"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

import { useIsDesktop } from "@/hooks/use-media-query"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast font-sans",
          title: "tabular-nums",
          description: "tabular-nums",
        },
      }}
      {...props}
    />
  )
}

/**
 * ResponsiveToaster — top-right on desktop, top-center on mobile so toasts
 * don't crowd the screen edge in portrait.
 */
function ResponsiveToaster() {
  const isDesktop = useIsDesktop()
  return (
    <Toaster
      richColors
      position={isDesktop ? "top-right" : "top-center"}
      duration={4000}
      toastOptions={{
        duration: 4000,
        classNames: {
          toast: "cn-toast font-sans",
          title: "tabular-nums",
          description: "tabular-nums",
          error: "!duration-[6000ms]",
        },
      }}
    />
  )
}

export { Toaster, ResponsiveToaster }
