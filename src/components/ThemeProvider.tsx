"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { ThemeProvider as NextThemesProvider } from "next-themes";

// Dynamically loaded with ssr:false so next-themes is excluded from the SSR
// bundle. This prevents the prerender workers from hitting useContext(null)
// on special pages (/_global-error, /_not-found) where the React module
// isn't fully initialized before next-themes evaluates.
const NextThemeProvider = dynamic(
  () => import("next-themes").then((m) => m.ThemeProvider),
  { ssr: false },
);

export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemeProvider>
  );
}
