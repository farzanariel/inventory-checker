/**
 * Discord webhook client for the inventory monitor.
 *
 * Per SPEC.md §8: send a rich embed with thumbnail, fields, and a bare cart URL
 * in `content` so Discord unfurls it as a tap-friendly link card. This module
 * is responsible only for formatting and POSTing payloads — it does NOT retry
 * (caller owns retry policy per §7.4) and never throws (returns SendResult).
 */

export type AlertContext = {
  sku: string;
  name: string;
  brand?: string;
  currentPriceCents: number;
  regularPriceCents?: number;
  buttonState: string;
  imageUrl: string;
  productUrl: string;
  cartUrl: string;
  note?: string;
};

export type SendResult =
  | { ok: true; status: number }
  | { ok: false; status?: number; error: string };

type EmbedField = { name: string; value: string; inline?: boolean };

type WebhookPayload = {
  username: string;
  content: string;
  embeds: Array<{
    title: string;
    url: string;
    color: number;
    thumbnail: { url: string };
    fields: EmbedField[];
    footer: { text: string };
    timestamp: string;
  }>;
};

const WEBHOOK_TIMEOUT_MS = 5000;
const COLOR_GREEN = 5763719;
const COLOR_AMBER = 16766720;

/**
 * Format a cents amount as a USD price string with thousands separators.
 * If a regular price is provided AND is greater than the current price,
 * appends " (was $Y.YY)".
 */
export function formatPrice(currentCents: number, regularCents?: number): string {
  const current = formatDollars(currentCents);
  if (regularCents !== undefined && regularCents > currentCents) {
    return `${current} (was ${formatDollars(regularCents)})`;
  }
  return current;
}

function formatDollars(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const DEFAULT_USERNAME = "Inventory Monitor";

function buildPayload(
  ctx: AlertContext,
  prefix: string,
  footerText: string,
  color: number,
  username: string = DEFAULT_USERNAME,
): WebhookPayload {
  const fields: EmbedField[] = [
    { name: "Price", value: formatPrice(ctx.currentPriceCents, ctx.regularPriceCents), inline: true },
    { name: "SKU", value: ctx.sku, inline: true },
    { name: "State", value: ctx.buttonState, inline: true },
  ];
  if (ctx.note) {
    fields.push({ name: "Note", value: ctx.note, inline: false });
  }

  return {
    username,
    content: ctx.cartUrl,
    embeds: [
      {
        title: `${prefix} ${ctx.name}`,
        url: ctx.productUrl,
        color,
        thumbnail: { url: ctx.imageUrl },
        fields,
        footer: { text: footerText },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

async function postWebhook(webhookUrl: string, payload: WebhookPayload): Promise<SendResult> {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
    if (!res.ok) {
      return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

export async function sendRestockAlert(
  webhookUrl: string,
  ctx: AlertContext,
  username?: string,
): Promise<SendResult> {
  const payload = buildPayload(
    ctx,
    "🟢 IN STOCK —",
    "Tap title to open • Add-to-cart link below",
    COLOR_GREEN,
    username,
  );
  return postWebhook(webhookUrl, payload);
}

export async function sendReminder(
  webhookUrl: string,
  ctx: AlertContext,
  username?: string,
): Promise<SendResult> {
  const payload = buildPayload(
    ctx,
    "🟢 STILL IN STOCK —",
    "reminder • Tap title to open",
    COLOR_GREEN,
    username,
  );
  return postWebhook(webhookUrl, payload);
}

export async function sendTestAlert(
  webhookUrl: string,
  username?: string,
): Promise<SendResult> {
  const ctx: AlertContext = {
    sku: "0000000",
    name: "TEST — Inventory Monitor is connected",
    brand: "Test",
    currentPriceCents: 49999,
    regularPriceCents: 59999,
    buttonState: "ADD_TO_CART",
    imageUrl: "https://placehold.co/200x200/10b981/ffffff?text=TEST",
    productUrl: "https://www.bestbuy.com/",
    cartUrl: "https://www.bestbuy.com/",
    note: "If you see this in Discord, your webhook is wired up correctly.",
  };
  const payload = buildPayload(
    ctx,
    "🧪 TEST —",
    "test notification • If you see this, your webhook works",
    COLOR_AMBER,
    username,
  );
  return postWebhook(webhookUrl, payload);
}
