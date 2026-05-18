/**
 * Small colored circle indicating stock status, with an optional warning
 * overlay when health is degraded or errored.
 *
 * SPEC §11: ●=in, ○=out, ?=unknown. health_status=ERROR adds a small ⚠ overlay.
 */

import { cn } from "@/lib/utils";

export type StockStatus = "UNKNOWN" | "IN_STOCK" | "OUT_OF_STOCK";
export type HealthStatus = "OK" | "DEGRADED" | "ERROR";

type Props = {
  stockStatus: StockStatus;
  healthStatus: HealthStatus;
  className?: string;
};

function dotColorVar(stockStatus: StockStatus, healthStatus: HealthStatus) {
  if (healthStatus === "ERROR") return "var(--color-status-error)";
  if (healthStatus === "DEGRADED") return "var(--color-status-degraded)";
  if (stockStatus === "IN_STOCK") return "var(--color-status-in)";
  if (stockStatus === "OUT_OF_STOCK") return "var(--color-status-out)";
  return "var(--color-status-out)"; // UNKNOWN — same hue as OOS, intentionally subdued
}

export function StatusDot({ stockStatus, healthStatus, className }: Props) {
  const showWarn = healthStatus === "ERROR" || healthStatus === "DEGRADED";
  const filled = stockStatus === "IN_STOCK";
  const color = dotColorVar(stockStatus, healthStatus);

  return (
    <span
      className={cn("relative inline-flex shrink-0 size-2", className)}
      aria-label={`stock ${stockStatus.toLowerCase()}, health ${healthStatus.toLowerCase()}`}
    >
      <span
        className="size-2 rounded-full"
        style={
          filled
            ? {
                backgroundColor: color,
                boxShadow: `0 0 6px ${color}, 0 0 10px color-mix(in srgb, ${color} 55%, transparent)`,
              }
            : {
                border: `1.5px solid ${color}`,
                backgroundColor: "transparent",
                boxShadow: `0 0 5px color-mix(in srgb, ${color} 60%, transparent)`,
              }
        }
      />
      {showWarn ? (
        <span
          className="absolute -right-1 -top-1 leading-none font-mono text-[8px]"
          style={{ color: "var(--color-status-degraded)" }}
          aria-hidden="true"
        >
          ⚠
        </span>
      ) : null}
    </span>
  );
}
