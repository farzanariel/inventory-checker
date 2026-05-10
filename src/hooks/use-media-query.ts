"use client";

/**
 * useMediaQuery — subscribes to a CSS media query and returns whether it matches.
 *
 * Returns `false` on the server and during the first client render to avoid
 * hydration mismatches; transitions to the real value on mount.
 */

import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    // Sync with current state on mount
    setMatches(mql.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}

/** Tailwind `md:` breakpoint — desktop above 768px. */
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 768px)");
}
