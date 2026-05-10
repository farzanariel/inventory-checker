"use client";

/**
 * Drawer — bottom-sheet primitive built on @base-ui/react/drawer.
 *
 * Mobile-first analog of <Dialog>: slides up from the bottom edge, native
 * swipe-to-dismiss, rounded top corners, respects iOS safe-area at the
 * bottom. Use <ResponsiveDialog> if you want desktop-modal / mobile-sheet
 * behaviour driven by a media query.
 */

import * as React from "react";
import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer";

import { cn } from "@/lib/utils";

function Drawer({ ...props }: DrawerPrimitive.Root.Props) {
  return <DrawerPrimitive.Root data-slot="drawer" {...props} />;
}

function DrawerTrigger({ ...props }: DrawerPrimitive.Trigger.Props) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />;
}

function DrawerPortal({ ...props }: DrawerPrimitive.Portal.Props) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />;
}

function DrawerClose({ ...props }: DrawerPrimitive.Close.Props) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />;
}

function DrawerOverlay({
  className,
  ...props
}: DrawerPrimitive.Backdrop.Props) {
  return (
    <DrawerPrimitive.Backdrop
      data-slot="drawer-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/50 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 duration-150",
        className,
      )}
      {...props}
    />
  );
}

function DrawerContent({
  className,
  children,
  ...props
}: DrawerPrimitive.Popup.Props) {
  return (
    <DrawerPortal>
      <DrawerOverlay />
      <DrawerPrimitive.Popup
        data-slot="drawer-content"
        className={cn(
          // Pinned to the bottom, full width, rounded top corners.
          "fixed inset-x-0 bottom-0 z-50 flex flex-col gap-4 rounded-t-xl border-t border-border bg-popover text-popover-foreground outline-none",
          // Generous bottom padding to clear iOS home indicator.
          "px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]",
          // Prevent rubber-band scroll past the sheet itself.
          "max-h-[92vh] overflow-y-auto",
          // Slide-in motion.
          "data-open:animate-in data-open:slide-in-from-bottom data-closed:animate-out data-closed:slide-out-to-bottom duration-200",
          className,
        )}
        {...props}
      >
        {/* Drag handle — visual cue + tap target for swipe-down dismiss. */}
        <div
          aria-hidden="true"
          className="mx-auto h-1 w-10 shrink-0 rounded-full bg-muted-foreground/30"
        />
        {children}
      </DrawerPrimitive.Popup>
    </DrawerPortal>
  );
}

function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-header"
      className={cn("flex flex-col gap-1 px-1 pt-1", className)}
      {...props}
    />
  );
}

function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-footer"
      className={cn(
        "mt-2 flex flex-col gap-2 px-1 pb-1 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

function DrawerTitle({ className, ...props }: DrawerPrimitive.Title.Props) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn(
        "font-heading text-base leading-tight font-medium",
        className,
      )}
      {...props}
    />
  );
}

function DrawerDescription({
  className,
  ...props
}: DrawerPrimitive.Description.Props) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Drawer,
  DrawerTrigger,
  DrawerPortal,
  DrawerClose,
  DrawerOverlay,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
};
