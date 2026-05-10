/**
 * Runtime settings — single-row `settings` table (id=1) with env fallback.
 *
 * `getSettings()` returns the resolved values that callers should actually use:
 *   - DB value wins when non-empty.
 *   - Empty/NULL → fall back to env (webhook URL) or built-in default (username).
 *
 * `updateSettings()` UPSERTs the row. Empty strings are stored as NULL so the
 * env fallback re-engages the next time `getSettings()` runs.
 */
import { eq } from "drizzle-orm";

import { getDb } from "./db/client";
import { settings } from "./db/schema";

export type ResolvedSettings = {
  discordWebhookUrl: string;
  discordUsername: string;
};

export type SettingsPatch = {
  discordWebhookUrl?: string | null;
  discordUsername?: string | null;
};

const DEFAULT_USERNAME = "Inventory Monitor";

export function getSettings(
  db: ReturnType<typeof getDb> = getDb(),
): ResolvedSettings {
  const row = db.select().from(settings).where(eq(settings.id, 1)).get();
  const dbUrl = row?.discordWebhookUrl?.trim() ?? "";
  const dbName = row?.discordUsername?.trim() ?? "";
  return {
    discordWebhookUrl: dbUrl !== "" ? dbUrl : process.env.DISCORD_WEBHOOK_URL ?? "",
    discordUsername: dbName !== "" ? dbName : DEFAULT_USERNAME,
  };
}

/**
 * Read the raw DB row without env fallback — used by the settings UI so the
 * form can show what's persisted vs. what's coming from env.
 */
export function getRawSettings(
  db: ReturnType<typeof getDb> = getDb(),
): { discordWebhookUrl: string; discordUsername: string } {
  const row = db.select().from(settings).where(eq(settings.id, 1)).get();
  return {
    discordWebhookUrl: row?.discordWebhookUrl ?? "",
    discordUsername: row?.discordUsername ?? "",
  };
}

export function updateSettings(
  patch: SettingsPatch,
  db: ReturnType<typeof getDb> = getDb(),
): void {
  const now = Date.now();
  const normalize = (v: string | null | undefined): string | null => {
    if (v == null) return null;
    const t = v.trim();
    return t === "" ? null : t;
  };

  const url = "discordWebhookUrl" in patch ? normalize(patch.discordWebhookUrl) : undefined;
  const name = "discordUsername" in patch ? normalize(patch.discordUsername) : undefined;

  db.insert(settings)
    .values({
      id: 1,
      discordWebhookUrl: url ?? null,
      discordUsername: name ?? null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: settings.id,
      set: {
        ...(url !== undefined ? { discordWebhookUrl: url } : {}),
        ...(name !== undefined ? { discordUsername: name } : {}),
        updatedAt: now,
      },
    })
    .run();
}
