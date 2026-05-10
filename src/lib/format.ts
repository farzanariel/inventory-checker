/**
 * Display formatters for the dashboard.
 */

const priceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function formatPrice(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return priceFormatter.format(cents / 100);
}

/**
 * Compact "0.4s ago", "12s ago", "3m ago", "2h ago", "5d ago".
 * Returns "—" for null/undefined.
 */
export function formatRelativeTime(
  fromMs: number | null | undefined,
  nowMs: number = Date.now(),
): string {
  if (fromMs == null) return "—";
  const diffMs = Math.max(0, nowMs - fromMs);
  if (diffMs < 1000) {
    const tenths = Math.round(diffMs / 100) / 10;
    return `${tenths.toFixed(1)}s ago`;
  }
  const seconds = diffMs / 1000;
  if (seconds < 60) {
    return `${Math.round(seconds)}s ago`;
  }
  const minutes = seconds / 60;
  if (minutes < 60) {
    return `${Math.round(minutes)}m ago`;
  }
  const hours = minutes / 60;
  if (hours < 24) {
    return `${Math.round(hours)}h ago`;
  }
  const days = hours / 24;
  return `${Math.round(days)}d ago`;
}

/**
 * Compact interval display: "1m", "30m", "2h", "1d".
 * Input is minutes (e.g. checkIntervalMin or restockNotifyIntervalMin).
 */
export function formatInterval(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) {
    const h = Math.round((minutes / 60) * 10) / 10;
    return `${h}h`;
  }
  const d = Math.round((minutes / 1440) * 10) / 10;
  return `${d}d`;
}

export function formatAbsoluteTime(ms: number): string {
  return new Date(ms).toLocaleString();
}
