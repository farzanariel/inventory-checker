/**
 * /api/test-notification — send a test Discord embed.
 *
 * Resolution order for webhook URL + username:
 *   1. JSON body (used by the settings page to test unsaved values)
 *   2. settings table (DB)
 *   3. process.env.DISCORD_WEBHOOK_URL / built-in "Inventory Monitor"
 *
 * Returns the SendResult shape: { ok, status?, error? }. HTTP 200 on success,
 * 502 on webhook failure, 400 if no webhook URL is resolvable.
 */

import { NextResponse } from "next/server";

import { sendTestAlert } from "@/lib/discord";
import { getSettings } from "@/lib/settings";

type Body = {
  webhook_url?: string;
  username?: string;
};

export async function POST(request: Request) {
  let body: Body = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const settings = getSettings();
  const webhookUrl = (body.webhook_url ?? "").trim() || settings.discordWebhookUrl;
  const username = (body.username ?? "").trim() || settings.discordUsername;

  if (!webhookUrl) {
    return NextResponse.json(
      { error: "No Discord webhook URL configured. Set one on the Settings page." },
      { status: 400 },
    );
  }

  const result = await sendTestAlert(webhookUrl, username);

  if (result.ok) {
    return NextResponse.json(result, { status: 200 });
  }

  return NextResponse.json(result, { status: 502 });
}
