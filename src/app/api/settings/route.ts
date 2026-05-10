/**
 * /api/settings — GET current values, PATCH to update.
 *
 * Returns BOTH the raw stored values and the resolved values (after env
 * fallback) so the UI can show what's persisted vs. what's coming from env.
 */

import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getRawSettings, getSettings, updateSettings } from "@/lib/settings";

const DISCORD_WEBHOOK_PREFIX = "https://discord.com/api/webhooks/";

const PatchSchema = z.object({
  discord_webhook_url: z
    .string()
    .max(500)
    .refine(
      (v) => v === "" || v.startsWith(DISCORD_WEBHOOK_PREFIX),
      `Webhook URL must start with ${DISCORD_WEBHOOK_PREFIX} (or be empty to clear)`,
    )
    .optional(),
  discord_username: z.string().max(80).optional(),
});

function firstZodIssue(err: z.ZodError): string {
  const issue = err.issues[0];
  if (!issue) return "Invalid request body";
  const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
  return `${path}${issue.message}`;
}

export async function GET() {
  try {
    const raw = getRawSettings();
    const resolved = getSettings();
    return NextResponse.json({
      stored: {
        discord_webhook_url: raw.discordWebhookUrl,
        discord_username: raw.discordUsername,
      },
      resolved: {
        discord_webhook_url: resolved.discordWebhookUrl,
        discord_username: resolved.discordUsername,
      },
      env_webhook_url_present: Boolean(process.env.DISCORD_WEBHOOK_URL),
    });
  } catch (err) {
    console.error("[GET /api/settings]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstZodIssue(parsed.error) }, { status: 400 });
  }

  try {
    updateSettings({
      ...(parsed.data.discord_webhook_url !== undefined
        ? { discordWebhookUrl: parsed.data.discord_webhook_url }
        : {}),
      ...(parsed.data.discord_username !== undefined
        ? { discordUsername: parsed.data.discord_username }
        : {}),
    });

    const raw = getRawSettings();
    const resolved = getSettings();
    return NextResponse.json({
      stored: {
        discord_webhook_url: raw.discordWebhookUrl,
        discord_username: raw.discordUsername,
      },
      resolved: {
        discord_webhook_url: resolved.discordWebhookUrl,
        discord_username: resolved.discordUsername,
      },
      env_webhook_url_present: Boolean(process.env.DISCORD_WEBHOOK_URL),
    });
  } catch (err) {
    console.error("[PATCH /api/settings]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
