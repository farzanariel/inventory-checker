/**
 * Discord webhook client for the inventory monitor.
 */

export type AlertContext = {
  sku: string;
  name: string;
  brand?: string;
  currentPriceCents: number;
  regularPriceCents?: number;
  baselinePriceCents?: number;
  buttonState: string;
  imageUrl: string;
  productUrl: string;
  cartUrl: string;
  note?: string;
};
export type PriceDropContext = AlertContext & {
  baselinePriceCents: number;
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
const COLOR_BLUE = 3900150;

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

function formatDropSummary(currentCents: number, baselineCents: number): string {
  const savedCents = baselineCents - currentCents;
  const pct = Math.round((savedCents / baselineCents) * 100);
  return `${formatDollars(baselineCents)} → ${formatDollars(currentCents)} (▼ ${pct}%, save ${formatDollars(savedCents)})`;
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

function buildPriceDropPayload(
  ctx: PriceDropContext,
  combined: boolean,
  username: string = DEFAULT_USERNAME,
): WebhookPayload {
  const baseline = ctx.baselinePriceCents;
  const fields: EmbedField[] = [
    { name: "Price", value: formatDropSummary(ctx.currentPriceCents, baseline), inline: true },
    { name: "SKU", value: ctx.sku, inline: true },
    { name: "State", value: ctx.buttonState, inline: true },
    { name: "Baseline", value: formatDollars(baseline), inline: true },
  ];
  if (ctx.note) {
    fields.push({ name: "Note", value: ctx.note, inline: false });
  }

  return {
    username,
    content: ctx.cartUrl,
    embeds: [
      {
        title: `${combined ? "🟢💰 IN STOCK + PRICE DROP —" : "💰 PRICE DROP —"} ${ctx.name}`,
        url: ctx.productUrl,
        color: combined ? COLOR_GREEN : COLOR_BLUE,
        thumbnail: { url: ctx.imageUrl },
        fields,
        footer: { text: combined ? "stock + price event • Tap title to open" : "price-drop alert • Tap title to open" },
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

export async function sendPriceDropAlert(
  webhookUrl: string,
  ctx: PriceDropContext,
  username?: string,
): Promise<SendResult> {
  return postWebhook(webhookUrl, buildPriceDropPayload(ctx, false, username));
}

export async function sendCombinedAlert(
  webhookUrl: string,
  ctx: PriceDropContext,
  username?: string,
): Promise<SendResult> {
  return postWebhook(webhookUrl, buildPriceDropPayload(ctx, true, username));
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
