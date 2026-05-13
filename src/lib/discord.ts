/**
 * Discord webhook client for the inventory monitor.
 */

export type AlertContext = {
  sku: string;
  name: string;
  brand?: string;
  currentPriceCents: number;
  regularPriceCents?: number;
  targetPriceCents?: number;
  buttonState: string;
  imageUrl: string;
  productUrl: string;
  cartUrl: string;
  note?: string;
  /** Retailer discriminator; controls field labelling. Default "bestbuy". */
  retailer?: "bestbuy" | "microcenter";
  /** For MC: the store name this alert is firing for ("TX - Dallas", "Shippable Items"). */
  storeName?: string;
  /** For MC: quantity on hand at the firing store. */
  qoh?: number;
};
export type PriceDropContext = AlertContext & {
  // "target" = user set a target_price and it was hit;
  // "drop"   = no target set, price decreased vs previously observed price.
  priceAlertMode: "target" | "drop";
  // For "target" mode this is the configured target; for "drop" mode this is the previous observed price.
  oldPriceCents: number;
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

function formatTargetSummary(currentCents: number, targetCents: number): string {
  // Current price is at or below target. Show how far below — flat when equal.
  if (currentCents >= targetCents) {
    return `${formatDollars(currentCents)} (target ${formatDollars(targetCents)})`;
  }
  const undershoot = targetCents - currentCents;
  return `${formatDollars(currentCents)} (target ${formatDollars(targetCents)} · ${formatDollars(undershoot)} below)`;
}

function formatDropSummary(previousCents: number, currentCents: number): string {
  const delta = previousCents - currentCents;
  if (delta <= 0) return formatDollars(currentCents);
  const pct = Math.round((delta / previousCents) * 100);
  return `${formatDollars(previousCents)} → ${formatDollars(currentCents)} (▼ ${pct}%, save ${formatDollars(delta)})`;
}

const DEFAULT_USERNAME = "Inventory Monitor";

function buildPayload(
  ctx: AlertContext,
  prefix: string,
  footerText: string,
  color: number,
  username: string = DEFAULT_USERNAME,
): WebhookPayload {
  const isMc = ctx.retailer === "microcenter";
  const fields: EmbedField[] = [
    { name: "Price", value: formatPrice(ctx.currentPriceCents, ctx.regularPriceCents), inline: true },
    isMc
      ? { name: "Store", value: ctx.storeName ?? "MicroCenter", inline: true }
      : { name: "SKU", value: ctx.sku, inline: true },
    isMc
      ? { name: "Qty", value: ctx.qoh != null ? String(ctx.qoh) : "—", inline: true }
      : { name: "State", value: ctx.buttonState, inline: true },
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
  const isTarget = ctx.priceAlertMode === "target";
  const priceValue = isTarget
    ? formatTargetSummary(ctx.currentPriceCents, ctx.oldPriceCents)
    : formatDropSummary(ctx.oldPriceCents, ctx.currentPriceCents);
  const isMc = ctx.retailer === "microcenter";
  const fields: EmbedField[] = [
    { name: "Price", value: priceValue, inline: true },
    isMc
      ? { name: "Store", value: ctx.storeName ?? "MicroCenter", inline: true }
      : { name: "SKU", value: ctx.sku, inline: true },
    isMc
      ? { name: "Qty", value: ctx.qoh != null ? String(ctx.qoh) : "—", inline: true }
      : { name: "State", value: ctx.buttonState, inline: true },
    {
      name: isTarget ? "Target" : "Was",
      value: formatDollars(ctx.oldPriceCents),
      inline: true,
    },
  ];
  if (ctx.note) {
    fields.push({ name: "Note", value: ctx.note, inline: false });
  }

  const dropLabel = isTarget ? "PRICE TARGET HIT" : "PRICE DROP";
  const footerLabel = isTarget ? "target hit" : "price drop";
  return {
    username,
    content: ctx.cartUrl,
    embeds: [
      {
        title: `${combined ? "🟢💰 IN STOCK + " + dropLabel + " —" : "💰 " + dropLabel + " —"} ${ctx.name}`,
        url: ctx.productUrl,
        color: combined ? COLOR_GREEN : COLOR_BLUE,
        thumbnail: { url: ctx.imageUrl },
        fields,
        footer: { text: combined ? `stock + ${footerLabel} • Tap title to open` : `${footerLabel} • Tap title to open` },
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
