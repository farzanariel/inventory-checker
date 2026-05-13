# inventory-checker — Design Spec

**Status:** Endpoint spike PROVEN. Codex round-1 review incorporated. Ready for round-2 review or build.
**Author:** Personal project
**Date:** 2026-05-10
**Reviewer:** Codex (round-1 done; round-2 pending)

---

## 0. Changelog

- **v8 (2026-05-13, NEC-XX):** Added §21 MicroCenter adapter — first non-Best-Buy retailer. Endpoint spike proved that one fetch of `/product/{productId}/...?storeid=029` returns all 32 stores' stock in a single `var inventory = [{qoh, storeNumber, storeName, productId}, ...]` block embedded in the PDP HTML, plus the national price in `#pricing[content]` / JSON-LD offers. Price does not vary by store (confirmed by user). MicroCenter sits behind Cloudflare's managed JS challenge; the existing patchright + residential-proxy stack from §20 clears it. §3 amended: "Multi-retailer support" non-goal scoped down to "no general retailer plugin system" — Best Buy + MicroCenter are now in v1 scope. §9 gains an `item_stores` table for per-(item, store) state with a per-row `alert_enabled` flag. `items` gains `retailer` and `mc_product_id` columns. §11 add/edit modal grows a MicroCenter branch with a multi-select store dropdown (all 32 stores discovered on first fetch, all checked by default, with "All / In-store only / Online only / None" quick-actions; the Web Store `029` "Shippable Items" appears as a distinguished entry at the top labelled "Online (Shippable)"). §7 state machine generalizes: for MC items, transitions/reminders key on `(item_id, store_number)` instead of `item_id`, and notification fire is gated by `item_stores.alert_enabled`. §16 tests gain MC PDP parser + per-(item, store) state machine.
- **v6 (2026-05-11):** Per-feature opt-in + once/repeat notify modes. Migration `0004_notify_modes.sql` adds `stock_alert_enabled` (default 1), `stock_notify_mode` ('once'|'repeat', default 'repeat'), and `price_notify_mode` ('once'|'repeat', default 'repeat'). Add/Edit modal now exposes Stock alerts and Price alerts as parallel collapsible sections — at least one must be on. `decideStock` skips alert+reminder paths when stock alerts are off; in 'once' mode the OOS→IN_STOCK transition fires but reminders are suppressed. `decidePriceAlert` in 'once' mode treats a non-null `last_price_notified_at` as permanent silence; PATCH clears that gate (and the pending-hit guard) when the mode is toggled.
- **v5 (2026-05-11):** §19 rewritten as a target-price model after user feedback on the v4 threshold UI ("why is it in cents and not dollars? also, just let me input a target price instead"). Migration `0003_target_price.sql` drops the six unused threshold/baseline/pending-lower columns and adds `target_price_cents`, `pending_hit_price_cents`, `pending_hit_seen_count`. UI surfaces a single dollar input that's current-price-aware ("currently $X.XX" inline; soft-error when target ≥ current). Decision rule: fire when `currentPrice <= targetPrice` after two consecutive same-price observations and cooldown clear. The `'any'` direction toggle is dropped from §18 backlog (no longer meaningful under target model). §9.1 audit table: `PRICE_DROP` message format becomes `"<target> -> <current>"`. §16 tests rewritten accordingly.
- **v4.1 (2026-05-11):** §6.7 extended for NEC-13. Best Buy publishes a fourth URL form from ad/search landing pages (`bestbuy.com/product/{slug}/{ALPHANUMERIC_PRODUCT_CODE}`) where no numeric SKU appears in the URL. `parseUrlOrSku` remains sync and pattern-only; a new async `resolveSkuFromInput` falls back to fetching the page and reading `<link rel="canonical">` / `og:url` / JSON-LD `sku`. Wired into `POST /api/items` and `POST /api/products/lookup`; AddItemDialog uses `looksResolvableBestBuyInput` for preview debounce.
- **v4 (2026-05-11):** Added §19 Price Change Alerts (NEC-10). Schema gains 10 columns on `items` for per-item price-alert config + baseline + stale-price guard. `stock_events.status` gains `'PRICE_DROP'`. §9.1 retention table extended to include `PRICE_DROP` (significant event) and document `NOTIFIED` rows (already in code, now formalized). §16 test list adds three new test files. §18 backlog moves "Price drop alerts" out (shipped) and adds the `'any'` direction toggle + open-box price tracking as new phase-2 items. CEO confirmation accepted 2026-05-11 (NEC-10 interaction `e6bb58f2-3f0b…`); Codex round-1 review (NEC-12) `approve-with-edits` folded in: baseline-update decision table, sharpened stale-price guard, `'any'` direction dropped from v1 scope.
- **v3 (2026-05-10):** Codex round-2 patches applied. §6.4 clarifies we use `buttonState`, not `purchasable` (and SKU 6587182 currently maps to OUT_OF_STOCK, not IN_STOCK). §7.4 renamed delivery contract from "at-least-once" to "best-effort with reminder recovery" — true at-least-once needs an outbox (Phase 2). §7.5 rewritten so the Best Buy fetch happens BEFORE the SQLite write lock; transaction scope is now read-decide-write only. Added `PRAGMA busy_timeout`. §13/§7 split into `fetchProducts(skus[])` (pure HTTP) and `applyCheckResult(itemId, result)` (DB transaction) so batching and check-now share one transactional path. §9 added explicit retention semantics for `stock_events` — transitions, errors, and notification attempts only, NOT every poll. §16 manual verification corrected for SKU 6587182's actual current state.
- **v2 (2026-05-10):** Codex round-1 review incorporated. §6 rewritten with proven endpoint. §7 notification state machine clarified (UNKNOWN handling, concurrency, delivery contract). §9 data model split status into stock vs health. §10 added URL parser for both formats. §14/§15 softened proxy language; documented TLS-fingerprint dependency. Added worker heartbeat. Added tests section. Project-local CLAUDE.md overrides global Vercel/Supabase preset.
- **v7 (2026-05-12, NEC-34):** Added §20 Headless Browser Pipeline (Akamai bypass). Switched from playwright-extra + puppeteer-extra-plugin-stealth to patchright (Playwright fork with sensor-evading patches). Added session warming (visit bestbuy.com homepage → wait for _abck → persist storage state). Documented proxy credentials in §15 deployment.

---

## 1. Problem

I run purchase bots that buy items in bulk from Best Buy. Items I target frequently sell out, and manually refreshing product pages to know when they restock is the bottleneck — I miss restocks, and when I do catch one, I've already wasted hours of attention.

I need a personal, self-hosted tool that watches a list of Best Buy SKUs and pings me on Discord the instant they go from out-of-stock to in-stock, with a one-click cart link, so I can re-fire my bots immediately.

## 2. Goals

- Detect Best Buy restocks within ~30–90 seconds of them happening, per-item-configurable.
- Send a rich Discord webhook alert (name, image, price, direct add-to-cart link) on the out→in transition.
- Re-ping every N minutes (per-item) while the item remains in stock, so I don't miss it if I missed the first alert.
- Web dashboard (Next.js) to add/remove/configure items via paste-URL-or-SKU smart input.
- Self-hosted on my VPS, gated by Cloudflare Access (email allowlist).
- Survive process restarts, machine reboots, and short network blips without losing watchlist or duplicating alerts (at-least-once Discord delivery — see §7.4).

## 3. Non-Goals

- **General retailer plugin system.** v1 supports exactly two retailers — Best Buy (§6) and MicroCenter (§21). They share the §7 notification state machine and §9 data model but have separate fetchers. We do NOT build a pluggable adapter framework, abstract retailer interface, or DSL. Adding a third retailer is a Phase-2 conversation.
- **Multi-user / accounts / app-level auth.** Single user. Cloudflare Access handles all auth at the edge.
- **Auto-purchase / bot integration.** I'll trigger my bots manually from the alert.
- **Price drop / open-box / store-pickup detection.** Just basic restock for v1.
- **Mobile app.** Dashboard is web-only; phone access via the same domain.
- **Headless browser scraping.** The proven JSON endpoint (§6) is sufficient.
- **Anti-bot evasion strategy.** We respect rate limits and back off on errors. Proxy rotation is an env-var-ready escape hatch, not a primary strategy.

## 4. Scale & Constraints

| | |
|---|---|
| Watchlist size | <25 items typical, design for ≤100 |
| Check rate | Configurable per item; 30s minimum, 60s default. Jitter ±10% applied. |
| Concurrency | Single VPS, single user, no horizontal scaling |
| Storage | <100 MB SQLite file even after a year of events with 7-day retention |
| Strategy | Respect rate limits, back off on 403/429, surface degraded state in UI |

## 5. Architecture

```
                     ┌────────────────────────┐
   Cloudflare        │        VPS             │
   Access (email) →  │                        │
                     │  ┌──────────────┐      │
   Browser ─────────→│  │  Next.js app │ pm2  │
                     │  │  :3000       │      │
                     │  └──────┬───────┘      │
                     │         │              │
                     │   reads/writes         │
                     │         ▼              │
                     │  ┌──────────────┐      │
                     │  │ SQLite (WAL) │      │
                     │  │ data.db      │      │
                     │  └──────┬───────┘      │
                     │         │              │
                     │   reads/writes         │
                     │         ▼              │
                     │  ┌──────────────┐      │
                     │  │ worker.ts    │ pm2  │
                     │  │ (Node)       │      │
                     │  └──────┬───────┘      │
                     │         │              │
                     └─────────┼──────────────┘
                               │
                               ▼
                  Best Buy /api/3.0/priceBlocks
                  Discord webhook
```

**Two processes, both pm2-managed, sharing one SQLite file in WAL mode.**

1. **Next.js app** — serves UI, handles API route handlers for CRUD on the watchlist. Does *not* poll itself.
2. **worker.ts** — long-running Node process that polls Best Buy in batched waves, writes status to DB, fires Discord webhooks.

Decision rationales:
- **Two processes (not Next.js `instrumentation.ts`)** — keeps polling alive across Next.js restarts; cleaner separation; pm2 owns auto-restart and boot persistence. Confirmed by Codex round-1.
- **SQLite (WAL)** — single VPS, single user, low write rate. better-sqlite3 is sync and fast for our scale. WAL allows concurrent readers + serialized writers; both processes can safely open the same file.
- **Cloudflare Access** — email-allowlist at the edge. Origin firewalled to Cloudflare IPs only. App has zero auth code.

## 6. Stock Detection — PROVEN

### 6.1 Endpoint

**`GET https://www.bestbuy.com/api/3.0/priceBlocks?skus={SKU}` (or comma-separated batch).**

Verified 2026-05-10 against SKU 6587182:
- HTTP 200, ~165ms
- Multi-SKU batching: `?skus=A,B,C` returns array (efficiency win — 1 request per check wave for the whole watchlist).
- 10 sequential calls: zero rate-limit hits.

### 6.2 Required client characteristics

**MUST use Node's `fetch` (or undici directly).** curl is rejected at the TLS-fingerprint layer by Best Buy's edge (Akamai); the request is killed before any HTTP response. Confirmed via spike.

Required headers:
```
User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36
Accept: application/json
Accept-Language: en-US,en;q=0.9
Referer: https://www.bestbuy.com/
```

### 6.3 Response parsing

Per-SKU object lives at `response[i].sku`. Fields we use:

| Field | Path | Use |
|---|---|---|
| name | `sku.names.short` | Display name |
| brand | `sku.brand.brand` | Optional, displayed in UI |
| currentPrice | `sku.price.currentPrice` | Stored as cents, shown in alert |
| regularPrice | `sku.price.regularPrice` | Optional, for "X% off" badge |
| **purchasable** | `sku.buttonState.purchasable` | Coarse availability flag |
| **buttonState** | `sku.buttonState.buttonState` | Fine-grained state (see §6.4) |
| canonicalUrl | `sku.url` | `/site/.../{sku}.p?skuId={sku}` |
| skuId | `sku.skuId` | Echoed back; used to validate response |

Image URL is **not** in this response. Use deterministic CDN pattern (verified 200 OK):
```
https://pisces.bbystatic.com/image2/BestBuy_US/images/products/{sku.slice(0,4)}/{sku}_sd.jpg
```

Add-to-cart URL (universal, no parsing required):
```
https://www.bestbuy.com/cart?skuId={SKU}
```

### 6.4 Stock interpretation

**The single source of truth is `buttonState`. We do NOT trust `purchasable` alone.** Best Buy returns `purchasable: true` for in-store-only items (e.g. SKU 6587182 currently has `purchasable: true` AND `buttonState: CHECK_STORES` — it is **OUT_OF_STOCK** for our purposes because no online add-to-cart is possible).

For the bot use case, "in stock" = **online-purchasable**, not "available somewhere":

| `buttonState` value | Maps to | Notes |
|---|---|---|
| `ADD_TO_CART` | **IN_STOCK** | Primary alert state |
| `LOW_STOCK` | **IN_STOCK** | Treat as ADD_TO_CART |
| `IN_CART` | **IN_STOCK** | Already in user's cart counts |
| `CHECK_STORES` | OUT_OF_STOCK | In-store-only, not bot-targetable (regardless of `purchasable: true`) |
| `SOLD_OUT_ONLINE` | OUT_OF_STOCK | |
| `SOLD_OUT` | OUT_OF_STOCK | |
| `COMING_SOON` | OUT_OF_STOCK | |
| `PRE_ORDER` | OUT_OF_STOCK | (User can opt-in later if desired) |
| (missing / undefined) | UNKNOWN → ERROR | Invalid SKU or response shape changed |

Implementation: helper `interpretStock(buttonState: string | undefined): 'IN_STOCK' | 'OUT_OF_STOCK' | 'UNKNOWN'`. `purchasable` is stored for diagnostics but not used in the decision.

### 6.5 Invalid SKU handling

If response item lacks `skuId` or `buttonState`, mark item `health_status = ERROR` with message "Invalid SKU or response missing fields", do not change `last_stock_status`, do not notify.

### 6.6 Failure handling

- Network/timeout/non-200: insert `stock_events` row `status='ERROR'`, increment `consecutive_errors`, do not change `last_stock_status`, do not notify.
- 3 consecutive errors: `health_status = DEGRADED`.
- 5 consecutive errors: `health_status = ERROR` (red indicator in UI).
- 429 / 403 / Cloudflare challenge: exponential backoff (30s → 60s → 120s → 300s, capped). Reset to baseline on any successful response. Log loudly.
- Successful response resets `consecutive_errors = 0` and `health_status = OK`.

### 6.7 URL parser (smart input)

Accepts ANY of these and extracts SKU:

| Input format | Example | Extract |
|---|---|---|
| New URL (numeric) | `https://www.bestbuy.com/product/acer-chromebook/sku/6587182` | `/sku/(\d{6,8})` |
| Old URL | `https://www.bestbuy.com/site/.../6587182.p?skuId=6587182` | `(\d{6,8})\.p` OR `skuId=(\d{6,8})` |
| Raw SKU | `6587182` | `^\d{6,8}$` |
| Ad landing page (alphanumeric) | `https://www.bestbuy.com/product/{slug}/JJ8V8H8627?utm_account=...` | fetch the page; read `<link rel="canonical">` / `og:url` / JSON-LD `sku` |
| Anything else | `gibberish` | reject with friendly error |

Implemented as two functions in `src/lib/parse-input.ts`:

- `parseUrlOrSku(input): { ok, sku } | { ok: false, error }` — **synchronous, pattern-only**. Used wherever a SKU can be derived from the string alone (worker logs, sync UI gates).
- `resolveSkuFromInput(input, { fetchImpl?, timeoutMs? }): Promise<...>` — async. Tries `parseUrlOrSku` first; only if the input is shaped like `bestbuy.com/product/{slug}/{ALPHANUMERIC}` does it issue a single GET with the same browser-like headers as §6 and scrape the response for the SKU. Used by `POST /api/items` and `POST /api/products/lookup`.

`looksResolvableBestBuyInput(input): boolean` is the cheap UI predicate (sync) that returns `true` when either `parseUrlOrSku` would succeed or the input is a Best Buy `/product/...` URL — used to debounce the AddItemDialog preview lookup without firing on every keystroke.

Unit-tested (§16) including the NEC-13 ad-URL fixture.

## 7. Notification Logic

### 7.1 State separation (Codex round-1 fix)

Two orthogonal status fields:

- **`last_stock_status`**: `UNKNOWN | IN_STOCK | OUT_OF_STOCK`
- **`health_status`**: `OK | DEGRADED | ERROR`
- **`consecutive_errors`**: counter, resets to 0 on any successful check

Errors do NOT corrupt stock state. A failed check leaves `last_stock_status` untouched but bumps `consecutive_errors` and may flip `health_status`.

### 7.2 State machine

```
                 ┌─────────┐
                 │ UNKNOWN │  (initial state, before first successful check)
                 └────┬────┘
                      │
       first check    │
       resolves to:   │
       ┌──────────────┴──────────────┐
       │                             │
       ▼                             ▼
 ┌──────────┐                ┌──────────────┐
 │ IN_STOCK │                │ OUT_OF_STOCK │
 │ (FIRE!)  │                │ (no alert)   │
 └────┬─────┘                └──────┬───────┘
      │                             │
      │  while still IN_STOCK:      │  on transition to IN_STOCK:
      │  if now > last_notified_at  │    fire alert,
      │  + restock_notify_interval: │    set last_notified_at = now,
      │    fire reminder,           │    set last_in_stock_at = now
      │    update last_notified_at  │
      │                             │
      │  on transition to           │
      │  OUT_OF_STOCK:              │
      │    reset last_notified_at   │
      │    (so next restock         │
      │     fires immediately)      │
      └──────────┬──────────────────┘
                 │
                 ▼
          (cycle continues)
```

### 7.3 First-check (UNKNOWN → IN_STOCK) — explicit decision

**FIRE the alert on UNKNOWN → IN_STOCK.** Rationale: user added the item to actively monitor; if it happens to be in stock the moment they add it, that IS the signal they want. Adding an item is an opt-in to receive its first restock alert.

Edge case: user adds item and immediately deletes it before first check — no notification, no DB residue (cascade delete on stock_events).

### 7.4 Discord delivery contract

**Best-effort delivery with reminder-based recovery.** This is NOT at-least-once — true at-least-once requires a `notification_outbox` table (Phase 2, §18). For v1 we accept that the FIRST alert of a transition can be lost in a narrow crash window, and rely on the reminder loop to surface the item again if it's still in stock.

Sequence (per applyCheckResult — see §7.5 for the full ordering):

```
... (transaction commits with new state including last_notified_at = now) ...
N. After COMMIT, fire webhook (POST with 5s timeout)
N+1. If webhook fails: retry once after 30s
N+2. If retry fails: log loudly, set health_status indicator, continue
```

**Crash window:** if the worker dies between COMMIT and the webhook send, `last_notified_at` is set in the DB but no Discord ping went out. Recovery: when the worker comes back up, the next check sees `last_stock_status = IN_STOCK` and `last_notified_at` set, so it does NOT re-fire (no duplicate). The user only receives a ping when the next reminder window elapses (still in stock) or the next out→in transition (item dropped and came back).

**For a personal tool monitoring <25 items, this is acceptable.** The reminder cadence (default 10 min) bounds worst-case notification delay during a crash to ~10 minutes. If that's too long in practice, upgrade to the outbox pattern in Phase 2.

Webhook failures (HTTP non-2xx) flip `health_status = DEGRADED` so the dashboard shows a "notifications degraded" badge. They do NOT affect stock detection or stock_events logging.

### 7.5 Concurrency: worker vs `/api/items/:id/check-now`

**Problem:** if both worker and a manual check-now run simultaneously, both could see the same out→in transition and fire two alerts.

**Critical correctness rule (Codex round-2):** the Best Buy HTTP fetch happens OUTSIDE any DB lock. We do NOT hold `BEGIN IMMEDIATE` during a 165ms+ network round-trip — that would serialize the entire watchlist behind every fetch.

The check pipeline is split into two functions, both shared by the worker and the check-now route:

```ts
// lib/bestbuy.ts — pure HTTP, no DB
fetchProducts(skus: string[]): Promise<Map<sku, ProductResult>>

// lib/checker.ts — DB transaction, no HTTP
applyCheckResult(itemId: number, result: ProductResult): {
  transitioned: boolean;
  notification: 'alert' | 'reminder' | null;
  reason: string;
}
```

Per-item lifecycle:

```
1. (NO LOCK) Caller invokes fetchProducts([sku])           ← network I/O, ~165ms
2. (NO LOCK) Receive ProductResult { name, price, buttonState, ... }
3. BEGIN IMMEDIATE                                          ← acquire write lock (typically <1ms)
4. SELECT * FROM items WHERE id = ?                         ← re-read fresh state (may have changed during the fetch)
5. Compute new state from (fresh DB row, just-fetched result, current time)
6. Decide notification: 'alert' | 'reminder' | null
7. UPDATE items SET (...) WHERE id = ?
8. INSERT INTO stock_events (...) IF and only if §9 retention rules say so
9. COMMIT                                                   ← release lock fast
10. (after commit) if notification != null → fire Discord webhook
```

**Why re-read in step 4:** another caller may have completed steps 3–9 for the same item while we were fetching. After we acquire the lock, the freshly-read state reflects their write. Our decision in step 6 uses that fresh state, so the second caller sees the first's `last_notified_at` and skips firing. This is the dedupe guarantee.

**`PRAGMA busy_timeout = 5000`** set at every connection init. If the lock is held when we try `BEGIN IMMEDIATE`, SQLite waits up to 5 seconds before erroring. At our scale (≤25 items, transactions <5ms), this is more than enough headroom.

**Worker batching is preserved:** each worker tick collects all due items, calls `fetchProducts(allSkus)` ONCE for the batch, then iterates results calling `applyCheckResult(id, result[sku])` per item. Each `applyCheckResult` is its own short transaction. Check-now is the same pipeline with a one-element list.

### 7.6 Jitter & timeouts

- Per-item check interval: configured value ± 10% jitter, applied per-tick.
- HTTP request timeout: 10 seconds. Beyond that → ERROR.
- Webhook send timeout: 5 seconds.

## 8. Discord Webhook Payload

Single global webhook URL via `DISCORD_WEBHOOK_URL` env var. Per-item override: deferred to Phase 2 (confirmed acceptable).

```json
{
  "username": "Inventory Monitor",
  "embeds": [{
    "title": "🟢 IN STOCK — {product_name}",
    "url": "https://www.bestbuy.com/site/{...}.p?skuId={SKU}",
    "color": 5763719,
    "thumbnail": { "url": "https://pisces.bbystatic.com/image2/BestBuy_US/images/products/{sku4}/{sku}_sd.jpg" },
    "fields": [
      { "name": "Price", "value": "${price}", "inline": true },
      { "name": "SKU", "value": "{sku}", "inline": true },
      { "name": "State", "value": "{buttonState}", "inline": true },
      { "name": "Note", "value": "{user_note_if_present}", "inline": false }
    ],
    "footer": { "text": "Tap title to open • Add-to-cart link below" },
    "timestamp": "{iso8601}"
  }],
  "content": "https://www.bestbuy.com/cart?skuId={SKU}"
}
```

The `content` field with the bare URL is what makes Discord render an unfurled, large clickable link the user can hit on their phone in two taps. (Components/buttons in webhooks are restricted; raw URL is the most reliable approach.)

Reminder embed uses title prefix `🟢 STILL IN STOCK` and a footer `"reminder"`.

Test webhook (`/api/test-notification`): hardcoded fake item ("PS5 Slim Disc — TEST") so the user can verify formatting without waiting for a real restock.

## 9. Data Model

```sql
CREATE TABLE items (
  id                              INTEGER PRIMARY KEY AUTOINCREMENT,
  sku                             TEXT NOT NULL UNIQUE,
  name                            TEXT,
  brand                           TEXT,
  image_url                       TEXT,
  product_url                     TEXT NOT NULL,
  current_price_cents             INTEGER,
  regular_price_cents             INTEGER,
  check_interval_sec              INTEGER NOT NULL DEFAULT 60,
  restock_notify_interval_sec     INTEGER NOT NULL DEFAULT 600,  -- 10 min
  enabled                         INTEGER NOT NULL DEFAULT 1,    -- 0/1 boolean
  note                            TEXT,
  -- separated status fields (per Codex round-1)
  last_stock_status               TEXT NOT NULL DEFAULT 'UNKNOWN', -- UNKNOWN | IN_STOCK | OUT_OF_STOCK
  last_button_state               TEXT,                            -- raw API value (CHECK_STORES, ADD_TO_CART, etc.)
  health_status                   TEXT NOT NULL DEFAULT 'OK',      -- OK | DEGRADED | ERROR
  last_health_message             TEXT,
  consecutive_errors              INTEGER NOT NULL DEFAULT 0,
  -- timestamps (unix ms)
  last_checked_at                 INTEGER,
  last_in_stock_at                INTEGER,
  last_notified_at                INTEGER,
  next_check_due_at               INTEGER,                         -- precomputed: last_checked_at + interval ± jitter
  created_at                      INTEGER NOT NULL,
  updated_at                      INTEGER NOT NULL
);

CREATE TABLE stock_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id      INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  status       TEXT NOT NULL,    -- 'IN_STOCK' | 'OUT_OF_STOCK' | 'ERROR'
  button_state TEXT,             -- raw API value
  price_cents  INTEGER,
  message      TEXT,             -- error detail if status=ERROR
  ts           INTEGER NOT NULL
);

CREATE TABLE worker_heartbeat (
  id                 INTEGER PRIMARY KEY CHECK (id = 1), -- single-row table
  last_tick_at       INTEGER NOT NULL,
  items_checked_last INTEGER NOT NULL DEFAULT 0,
  errors_last        INTEGER NOT NULL DEFAULT 0,
  worker_version     TEXT
);

CREATE INDEX idx_events_item_ts ON stock_events(item_id, ts DESC);
CREATE INDEX idx_items_due ON items(enabled, next_check_due_at);
```

### 9.1 stock_events retention semantics (Codex round-2)

`stock_events` is an **audit log of significant events**, NOT a per-poll log. Insert exactly when one of the following is true:

| Trigger | When | `status` value |
|---|---|---|
| State transition | `last_stock_status` changes (UNKNOWN→IN_STOCK, IN_STOCK→OUT_OF_STOCK, etc.) | The new status |
| Error event | Network/timeout/non-200 OR invalid response shape | `ERROR` (with `message` populated) |
| Price drop fired | `baseline_price_cents` advances after a price-drop alert fires (§19) | `PRICE_DROP` (with `price_cents` = new lower price, `message = "<oldCents> -> <newCents>"`) |
| Notification attempt | After every Discord webhook fire (stock alert, reminder, price drop, or combined) | `NOTIFIED` (with `message = 'alert' \| 'reminder' \| 'price_drop' \| 'combined' \| 'failed: <reason>'`) |

**Do NOT insert** an event for steady-state polls (e.g. checking an item that stays IN_STOCK between reminder windows). At 25 items × 30s checks, naive logging would write ~72k rows/day — useless noise. Transition-based logging keeps the table small and the audit trail meaningful.

**Pruning:** worker runs `DELETE FROM stock_events WHERE ts < (now - 7*24*3600*1000)` once per hour.

**Heartbeat:** worker `UPDATE worker_heartbeat SET last_tick_at = ?, items_checked_last = ?, errors_last = ? WHERE id = 1` after each polling cycle. `/api/health` reads this; if `now - last_tick_at > 5 * max_check_interval`, return 503.

## 10. API Routes (Next.js route handlers)

| Method | Path | Body | Description |
|---|---|---|---|
| GET | `/api/items` | — | List all items + current status |
| POST | `/api/items` | `{ input, check_interval_sec, restock_notify_interval_sec, note? }` | Smart-parse input, create item, schedule first check |
| PATCH | `/api/items/:id` | partial fields | Update interval, note, enabled |
| DELETE | `/api/items/:id` | — | Remove item (cascades) |
| POST | `/api/items/:id/check-now` | — | Force immediate check via shared `checkOneItem` |
| GET | `/api/items/:id/events?limit=50` | — | Recent events |
| POST | `/api/test-notification` | — | Send test Discord embed |
| GET | `/api/health` | — | `{ status, worker_last_tick_age_ms, items_checked_last }` |

Routes are unauthenticated at the app level. Cloudflare Access enforces auth at the edge.

## 11. UI

One page. Linear/Vercel ops-tool aesthetic.

```
┌──────────────────────────────────────────────────────────────┐
│  Inventory Monitor                            ● 12 watching   │
│  user@example.com                       [Test] [+ Add item]   │
├──────────────────────────────────────────────────────────────┤
│  ●  PS5 Slim Disc Edition           $499.99   IN STOCK   ⋯   │
│     SKU 6577206 · 30s · last 0.4s ago                         │
│  ○  RTX 5090 FE                     $1,999.99 OOS         ⋯   │
│     SKU 6618421 · 60s · last 1.1s ago                         │
│  ○  Steam Deck OLED 1TB             $649.00   OOS         ⋯   │
│     SKU 6571379 · 90s · last 0.8s ago                         │
│  ⚠  LG C4 OLED 65                   —         ERROR       ⋯   │
│     SKU 6535068 · 120s · 3 consecutive errors                 │
└──────────────────────────────────────────────────────────────┘
```

- Auto-refresh every 5s (poll `/api/items`).
- ⋯ menu: Edit, Pause/Resume, Check Now, View History, Delete.
- Status dot reflects `last_stock_status` (●=in, ○=out, ?=unknown). `health_status=ERROR` adds a small ⚠ overlay.
- Compact 40–48px rows, no shadows, IBM Plex Mono for SKU/price/timestamps, Inter for product names.

Theme tokens:
- bg `#0a0a0a`, surface `#111`, border `#1f1f1f`
- text-primary `#e5e5e5`, text-secondary `#737373`
- accent green `#10b981` (in-stock), red `#ef4444` (error), amber `#f59e0b` (degraded)

## 12. Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 App Router |
| Language | TypeScript strict |
| UI | Tailwind v4 + shadcn/ui |
| DB | better-sqlite3 + Drizzle ORM (WAL mode) |
| Worker | Plain Node (`tsx` for dev, compiled JS for prod) |
| HTTP | Built-in `fetch` (Node 22) |
| Process mgr | pm2 |
| Auth | Cloudflare Access (off-app) |
| Tests | vitest |

## 13. File Structure

```
inventory-checker/
├── SPEC.md
├── CLAUDE.md                    # project-local override
├── README.md
├── package.json
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
├── drizzle.config.ts
├── ecosystem.config.js          # pm2: [next, worker]
├── .env.example
├── .gitignore                   # ignore data/, .env, node_modules
├── data/
│   └── data.db                  # gitignored
├── drizzle/                     # migrations
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── globals.css
│   │   └── api/
│   │       ├── items/
│   │       │   ├── route.ts
│   │       │   └── [id]/
│   │       │       ├── route.ts
│   │       │       ├── check-now/route.ts
│   │       │       └── events/route.ts
│   │       ├── test-notification/route.ts
│   │       └── health/route.ts
│   ├── components/
│   │   ├── ItemList.tsx
│   │   ├── ItemRow.tsx
│   │   ├── AddItemDialog.tsx
│   │   ├── StatusDot.tsx
│   │   └── ui/                  # shadcn
│   ├── lib/
│   │   ├── db/
│   │   │   ├── client.ts        # better-sqlite3 + drizzle, WAL, busy_timeout=5000
│   │   │   ├── schema.ts
│   │   │   └── queries.ts
│   │   ├── bestbuy.ts           # fetchProducts(skus[]) — pure HTTP, no DB
│   │   ├── discord.ts           # sendRestockAlert, sendReminder, sendTest
│   │   ├── parse-input.ts       # parseUrlOrSku
│   │   └── checker.ts           # applyCheckResult(itemId, result) — DB transaction; shared by worker + check-now
│   └── worker/
│       └── index.ts             # main loop: fetch due items, batch by 25, dispatch
└── test/
    ├── parse-input.test.ts
    ├── interpret-stock.test.ts
    ├── checker.test.ts          # mocked fetch; transition + dedupe + error cases
    └── notification.test.ts
```

## 14. Operational Concerns

- **Backups:** SQLite is one file. `cp data/data.db data/backups/data.db.YYYYMMDD` daily via cron, keep 14 days.
- **Logs:** pm2 captures stdout/stderr per process. Worker logs each tick at info, errors at warn. Rotation via `pm2-logrotate`.
- **Boot persistence:** `pm2 save && pm2 startup` so both processes auto-start on VPS reboot.
- **Updating:** `git pull && npm install && npm run build && pm2 reload all`.
- **Best Buy starts blocking:** First sign is sustained 403/429 across multiple items (check `consecutive_errors` aggregate). Mitigation:
  1. Increase intervals (less aggressive polling).
  2. Drop in proxies (env var `BB_PROXY`, format `host:port:user:pass`).
  3. Enable headless fallback (already in place for newer-catalog SKUs; depends on patchright + session warming, see §20).
  4. Last resort: switch to Best Buy's official Products API (free key, requires registration, "near-real-time" updates — slower than the unofficial endpoint but reliable).
- **Discord webhook fails:** retry once at 30s; if still fails, log + show "notifications degraded" badge in UI; stock detection continues unaffected.
- **Time zones:** all timestamps stored as unix ms UTC, formatted client-side.

## 15. Risks & Open Questions (updated)

| Risk | Mitigation |
|---|---|
| Best Buy changes the priceBlocks endpoint shape | Thin parser in `bestbuy.ts`; integration test runs the parser against a recorded fixture and a live SKU during CI/manual checks |
| Best Buy escalates TLS fingerprinting beyond what Node's default `fetch` survives | Switch to undici with custom TLS context; or curl-impersonate via subprocess; or fall back to official Products API with a real API key |
| Best Buy starts rate-limiting harder | Reduce polling rate, add jitter (already in design), drop in proxies, last-resort: official API |
| SQLite write contention between worker + Next.js | `BEGIN IMMEDIATE` serializes writes; at <25 items + rare manual checks this is a non-issue. Sanity-tested in §16 |
| Worker dies and pm2 fails to restart | `/api/health` exposes worker heartbeat freshness; user can monitor externally (UptimeRobot) — Phase 2 |
| First alert lost between DB commit and webhook fire (§7.4) | Reminder loop provides natural recovery within `restock_notify_interval_sec` |
| Image CDN pattern changes | Fall back to scraping the canonical product page for `og:image` (Phase 2) |
| Proxy credentials leak | `.env` is gitignored; `BB_PROXY` and `BB_STORAGE_STATE` are runtime env vars never checked in |
| Residential proxy IP blocked by Best Buy | Provider rotates exit IPs; sticky session per SKU prevents mid-session IP change; fall back to a different provider if needed |
| Session-warmed storage state goes stale | `_abck` cookie expires ~1hr; context auto-recycles; stale state → warm-up re-run automatically on next check

## 16. Tests (per Codex round-1)

| Test | What it verifies |
|---|---|
| `parse-input.test.ts` | New URL, old URL, raw SKU, invalid input. Both URL formats from §6.7 |
| `interpret-stock.test.ts` | Every documented `buttonState` maps correctly; missing fields → UNKNOWN |
| `checker.test.ts` (mocked fetch) | UNKNOWN → IN_STOCK fires alert; out → in fires alert; in → in within reminder window does NOT fire; in → in past reminder window fires reminder; in → out resets `last_notified_at`; ERROR doesn't change stock state; restart with state=IN_STOCK and `last_notified_at` set does not duplicate first alert; **price-alert decision table from §19.4 (all six rows); combined stock+price tick fires exactly one webhook; baseline advances only on fire; stale-price guard requires 2 same-candidate hits; different-lower-price resets count to 1 for new candidate; cooldown blocks fire** |
| `checker.concurrency.test.ts` | Two simultaneous `checkOneItem(id)` calls produce exactly one alert (in-process via Promise.all) |
| `interpret-price-change.test.ts` | Pure threshold check: below threshold, at threshold, well above, increase, equal-to-baseline, `pct` wins, `cents` wins, baseline-not-set returns no-op |
| `notification.test.ts` | Webhook payload shape matches §8 for alert, reminder, test; **price-drop embed shape matches §19.6; combined embed shape matches §19.6** |

Manual verification before declaring v1 done:
1. Add SKU 6587182. See it appear with name "Acer - Chromebook 311…", price $159, **OUT_OF_STOCK** (its actual state at spike time was `buttonState: CHECK_STORES` despite `purchasable: true` — confirms §6.4 logic).
2. Add a SKU known to be currently `ADD_TO_CART` → expect IN_STOCK and an immediate alert (UNKNOWN→IN_STOCK fires per §7.3). Use a current Best Buy front-page in-stock item; record the SKU at test time.
3. Click test-notification button → receive test embed.
4. Restart worker mid-check (kill -9 during a fetch) — no duplicate alerts on next cycle (state remains consistent because the transaction is short and atomic).
5. Hit `/api/items/:id/check-now` simultaneously with a worker tick checking the same item (fire 5 in parallel via curl) — exactly one notification recorded in `stock_events`.

## 17. Done Criteria for v1

- [ ] Add a Best Buy URL or raw SKU; item appears with name/image/price within 5 seconds.
- [ ] On out→in transition, Discord receives alert within `check_interval_sec + 2s`.
- [ ] Reminder pings every `restock_notify_interval_sec` while in stock; zero pings while OOS.
- [ ] Worker restart does not duplicate alerts.
- [ ] Killing worker does not break dashboard.
- [ ] Manual `/check-now` while worker is checking the same item produces exactly one alert.
- [ ] Dashboard reachable at `https://inventory.{domain}` only with allowed Cloudflare Access email.
- [ ] After 7 days, old events auto-pruned.
- [ ] All tests in §16 pass.
- [ ] `/api/health` returns 200 with fresh heartbeat when worker is alive; 503 when stale.

## 18. Phase 2 Backlog

- Per-item Discord webhook overrides
- Open-box / pre-order / store-pickup state alerts
- Multi-retailer adapter pattern (Amazon, Target, Walmart)
- External uptime monitor pinging `/api/health`
- Mobile-optimized view
- Historical charts (in-stock duration patterns, restock frequency)
- Notification outbox for exactly-once delivery (if at-least-once becomes a real annoyance)
- **`price_alert_direction = 'any'` toggle** — fire on price increases too. Deferred from §19 v1 per Codex round-1 (NEC-12); needs explicit "price increase" semantics + tests before shipping.
- **Open-box / 3rd-party seller price tracking** (`priceBlocks.productOptions.multipleSellers[]`) — track condition-tagged prices, optionally as a separate alert class.
- **"Baseline forming" tooltip** during the first 24h after add (UXDesigner NEC-11 §10).
- **Per-item absolute price floor** ("ping me when this dips below $X").

## 19. Price Change Alerts (v1)

Issue: NEC-10. CEO confirmed defaults 2026-05-11; Codex round-1 review (NEC-12) folded in; UI design at NEC-11.

### 19.1 Goal

A second class of Discord alert that fires when the **current price** of a watched Best Buy SKU drops by a meaningful amount, distinct from but coexisting with the existing stock-back alerts (§7).

### 19.2 Trigger semantics

- **Direction:** drops only. (Phase 2 introduces an `'any'` toggle — §18.)
- **Threshold:** `(baseline - candidate) >= max(round(baseline * pct / 100), cents)`. Defaults: `pct = 5`, `cents = 1000` ($10).
- **Baseline:** `baseline_price_cents` is initialized to the first observed `currentPrice`. It advances **only** after a successful price-drop alert fires (see §19.4). Rationale: keeps comparisons honest — we don't silently lose ground to repeated tiny drops below threshold.
- **Cooldown:** per-item `price_notify_interval_min` (default 60). Within the cooldown window, the threshold is still computed but the fire is suppressed; baseline is **not** advanced.
- **Stale-price guard:** require the candidate price to be observed on **two consecutive** checks at the **same** value before firing. A different (still-lower) candidate seen on the second check resets the pending counter to 1 for the new candidate. Defends against API flicker.
- **While OOS:** per-item `price_alert_while_oos` toggle (default ON). When OFF, price drops during OOS are silently tracked (baseline-eligible) but no Discord ping.

### 19.3 Schema additions (`items`, migration `0002_price_alerts.sql`)

```sql
ALTER TABLE items ADD COLUMN price_alert_enabled        INTEGER NOT NULL DEFAULT 1;
ALTER TABLE items ADD COLUMN price_drop_threshold_pct   INTEGER NOT NULL DEFAULT 5;   -- 1..99
ALTER TABLE items ADD COLUMN price_drop_threshold_cents INTEGER NOT NULL DEFAULT 1000; -- $10
ALTER TABLE items ADD COLUMN price_notify_interval_min  INTEGER NOT NULL DEFAULT 60;
ALTER TABLE items ADD COLUMN last_price_notified_at     INTEGER;
ALTER TABLE items ADD COLUMN baseline_price_cents       INTEGER;
ALTER TABLE items ADD COLUMN baseline_set_at            INTEGER;
ALTER TABLE items ADD COLUMN price_alert_while_oos      INTEGER NOT NULL DEFAULT 1;
ALTER TABLE items ADD COLUMN pending_lower_price_cents  INTEGER;
ALTER TABLE items ADD COLUMN pending_lower_seen_count   INTEGER NOT NULL DEFAULT 0;
```

`stock_events.status` gains `'PRICE_DROP'` (see §9.1 retention table).

### 19.4 Decision table (the contract checker.ts must implement)

Inside `decide()`, after the stock decision, compute the price decision from the fresh row + just-fetched result:

| Condition | Baseline action | Pending fields | Fire? | `priceNotification` |
|---|---|---|---|---|
| Baseline not yet set (first successful check) | Set `baseline_price_cents = currentPrice`, `baseline_set_at = now`. | Clear | No | `null` |
| `candidate >= baseline` (no drop) | No change | Clear | No | `null` |
| `candidate < baseline`, threshold NOT met | No change | Track candidate (rule below) | No | `null` |
| `candidate < baseline`, threshold met, cooldown active | No change | Track candidate | No | `null` |
| `candidate < baseline`, threshold met, cooldown clear, `pending != candidate` | No change | `pending_lower_price_cents = candidate`, `pending_lower_seen_count = 1` | No | `null` |
| `candidate < baseline`, threshold met, cooldown clear, `pending == candidate`, count would reach 2 | **`baseline_price_cents = candidate`, `baseline_set_at = now`** | Clear | **Yes** | `'price_drop'` |
| `price_alert_enabled = 0` | No change to baseline/pending; tracking suspended | Clear | No | `null` |
| `price_alert_while_oos = 0` AND stock is OOS | Track normally; fire suppressed at dispatch (treated like cooldown) | Track candidate | No | `null` |

"Track candidate" means: if `pending_lower_price_cents != candidate`, replace it with `candidate` and set count to 1. If equal, increment count.

### 19.5 Concurrency (preserves §7.5 invariants)

The fetch-outside-lock + `BEGIN IMMEDIATE` + re-read + decide + commit ordering is **unchanged**. The price branch reads from the same fresh row as the stock branch, so a second concurrent `applyCheckResult` observes the first caller's `baseline_price_cents` and `last_price_notified_at` and correctly downgrades to no-op. No new locks, no new races.

### 19.6 Discord embed

Price-drop alert:

```
💰 PRICE DROP — {product name}
$159.99 → $129.99 (▼ 19%, save $30.00)
SKU 6587182 · baseline $159.99
{thumbnail}
{cart URL in content for unfurl}
```

Color: `0x3b82f6` (blue). Token: `--status-pricedrop` (UI side, NEC-11 §1).

Combined embed (stock-back + price-drop in same tick): title prefix `🟢💰 IN STOCK + PRICE DROP — {name}`, color stays green for primary, blue inline field for the price delta. Exactly **one** webhook fires; logged as `NOTIFIED` with `message='combined'`.

### 19.7 API surface

`PATCH /api/items/:id` accepts the new fields (server validation per §19.2 ranges):

- `price_alert_enabled` (boolean)
- `price_drop_threshold_pct` (int, 1–99)
- `price_drop_threshold_cents` (int, ≥ 0)
- `price_notify_interval_min` (int, 1–10080)
- `price_alert_while_oos` (boolean)

No new top-level route. Price-drop events flow through `GET /api/items/:id/events` because they're rows in `stock_events`.

### 19.8 UI

Implementation contract: [NEC-11#document-design](/NEC/issues/NEC-11#document-design) §9.

- New token `--status-pricedrop` in `globals.css` + `@theme inline`.
- Add/Edit dialogs gain a collapsible "Price alert" group; header is the master switch.
- Threshold inputs render inline as `5 % or 10 $` with "whichever is greater" subhead.
- ItemRow shows `▼-N%` chip in the price cluster when `currentPriceCents < baseline_price_cents`.
- ItemHistoryDialog renders `PRICE_DROP` rows via the existing 5-column grid; `statusColor()` / `statusLabel()` extended.

Direction toggle (`'any'`) is omitted from v1 UI per §18 phase-2 deferral.

---

**Reviewer prompt for Codex (round 2):**

> This is v2 of the spec. Round-1 review has been incorporated; the changelog is at §0. The Best Buy endpoint has been spike-proven against SKU 6587182 (see §6 — endpoint, response shape, image CDN, batching, burst tolerance, TLS fingerprint requirement). Re-review with focus on:
>
> - Does §7 close all dedupe / missed-alert / restart-corruption windows?
> - Is §7.5 (SQLite `BEGIN IMMEDIATE` as the single mutex) actually safe across two processes, or do I need IPC?
> - Is §16 the right test coverage?
> - Anything new I'm missing now that the endpoint is proven?
>
> Be blunt. If the design is shippable, say so plainly.

## 20. Headless Browser Pipeline (Akamai Bypass)

Issue: [NEC-34](/NEC/issues/NEC-34). Required because newer-catalog SKUs return `ProductNotFoundException` from the priceBlocks endpoint (§6) and must be scraped from the PDP via a full browser.

### 20.1 Stack

- **patchright** (Playwright fork v1.59.4+) — includes sensor-evading patches baked into the browser runtime (`runtime.enable`, `navigator.webdriver`, WebGL/canvas, plugins, permissions). Replaces playwright-extra + puppeteer-extra-plugin-stealth.
- **fingerprint-generator** + **fingerprint-injector** — per-session browser fingerprint diversity (user-agent, viewport, WebGL, canvas).
- **Residential proxy** — IPRoyal, NetNut, SOAX, or Bright Data (~$10/mo). Required for SKUs where the VPS's datacenter IP triggers the full Akamai challenge page.

### 20.2 Pipeline (stealth launch → proxy → warm session → PDP scrape)

```
1. chromium.launch(patchright, { proxy })       — patchright browser with sensor patches
2. browser.newContext({ fingerprint })            — diversified UA + viewport + canvas
3. fpInjector.attachFingerprintToPlaywright()     — inject remaining fingerprint spoofs
4. warmSession(bestbuy.com homepage)              — let sensor.js complete → _abck cookie planted
5. page.goto(`/site/-/${sku}.p`)                  — PDP with pre-warmed Akamai session
6. waitForSelector([data-testid$="-{sku}"])      — truth signal (buy button rendered)
7. page.evaluate(JSON-LD extraction)              — name, price, buttonState
8. persist storageState to disk                   — survive process restarts
```

### 20.3 Session warming (`warmSession()`)

Visit `https://www.bestbuy.com/` first, wait for `document.cookie` to contain a valid `_abck` value (starts with a digit — Akamai's signal that the sensor.js challenge passed). This plants the three Akamai cookies (`_abck`, `bm_sz`, `ak_bmsc`) in the browser context.

Storage state (cookies + localStorage) is persisted to disk via `context.storageState()`. On the next worker start or context recycle, the state is loaded via `browser.newContext({ storageState })`, skipping the 10–20s warm-up. The session is re-warmed after 30 minutes (`SESSION_WARMUP_EXPIRY_MS`) or if _abck expires (~1hr Akamai default).

### 20.4 Proxy configuration

Proxy credentials are stored in `.env`:

```env
BB_PROXY=host:port:username:password
BB_STORAGE_STATE=/root/inventory-checker/data/storage-state.json
```

`BB_PROXY` format: `host:port` for unauthenticated, or `host:port:user:pass` for authenticated. Parsed and plumbed through patchright's `proxy` launch option.

### 20.5 Settings in `bestbuy-headless.ts`

| Env var | Default | Description |
|---|---|---|
| `BB_PROXY` | (none) | Residential proxy in `host:port:user:pass` format |
| `BB_STORAGE_STATE` | (none) | Path to persist browser storage state for session warming |
| `BB_HEADLESS_TRACE` | `0` | Set to `1` for per-SKU timing traces |
| `BB_HEADLESS_DEBUG` | `0` | Set to `1` to dump PDP HTML to `/tmp/bb-pdp-{sku}.html` |

### 20.6 Resource blocking

80%+ of Best Buy PDP bytes are unnecessary (images, fonts, stylesheets, analytics). Blocked types:

- Resource types: `image`, `media`, `font`, `stylesheet`
- Host substrings: `google-analytics.com`, `googletagmanager.com`, `doubleclick.net`, `facebook.net`, `criteo.com`, `adsrvr.org`, `scorecardresearch.com`, `newrelic.com`, `nr-data.net`, `demdex.net`, `everesttech.net`, `branch.io`, `rfihub.com`

### 20.7 Context lifecycle

- Long-lived browser + context per process (reused across ticks).
- Recycled after 45 minutes (`MAX_CONTEXT_AGE_MS`) or 3 consecutive failures (`MAX_FAILURE_STREAK`).
- Old browser is drained asynchronously (closed on next `setImmediate`) so in-flight pages from concurrent calls complete naturally.
- Up to 3 headless calls run concurrently (`HEADLESS_CONCURRENCY`) with a 15s per-SKU timeout.

### 20.8 Out of scope

- TLS-impersonation HTTP client (sibling [NEC-33](/NEC/issues/NEC-33)).
- Notification / UI changes — purely a fetcher upgrade.

## 21. MicroCenter Adapter

Issue: NEC-XX (TBD). MicroCenter is the second supported retailer. Unlike Best Buy, MicroCenter stock is **intrinsically per-store** — each product has independent quantity-on-hand at ~32 physical stores plus a "Shippable Items" web-fulfillment store (store number `029`). v1 watches all 32 stores per item with one HTTP fetch and lets the user opt out of stores they don't care about.

### 21.1 Endpoint — PROVEN

```
GET https://www.microcenter.com/product/{productId}/{slug}?storeid=029
```

`{productId}` is the 6-digit numeric ID in the canonical URL (e.g. `688173` for Mac mini). `{slug}` is the SEO slug — the server ignores it for routing but expects something present. `?storeid=029` is mandatory: without a `storeid` cookie or query param, MicroCenter renders the price field empty (see §21.4).

Response is HTML (≈1 MB). Two data points are embedded:

**1. All-store inventory (the prize).** A `<script>` block near the end of `<body>` contains:

```js
var inventory = [
  {"qoh":1,"storeNumber":"205","storeName":"AZ - Phoenix","productId":708467},
  {"qoh":0,"storeNumber":"215","storeName":"TX - Austin","productId":708467},
  ...
  {"qoh":0,"storeNumber":"029","storeName":"Shippable Items","productId":708467}
];
```

- 32 entries — same set on every product as of 2026-05-13 (the reference repo `owenseay/stock-checker` lists the same store IDs).
- `qoh` is an integer count, not a boolean. `qoh > 0` ⇒ IN_STOCK at that store. `qoh === 0` ⇒ OUT_OF_STOCK.
- A missing store entry (count drops below 32 for that product) ⇒ treat as OUT_OF_STOCK for that store. Do not error.
- Store number `029` (`"Shippable Items"`) is the web-fulfillment store. `qoh > 0` there ⇒ orderable online. UI labels it "Online (Shippable)".

**2. Price.** National (does not vary by store, confirmed). Available in two places in the same response — read whichever lands first:

- `<span id="pricing" content="599.99">` — preferred (machine-readable attribute).
- JSON-LD `<script type="application/ld+json">` block with `@type: Product` → `offers.price`.

If `#pricing[content]` is empty and JSON-LD has no price, treat as ERROR (will retry next tick). Do not fall back to `.big-price` text scraping — it sometimes shows the member-only price.

### 21.2 Bot-defense — Cloudflare managed challenge

MicroCenter sits behind Cloudflare's managed JS challenge (`cf-mitigated: challenge` on raw requests). curl/undici/native fetch all hit a 403 with the "Just a moment..." page. **Resolution: the existing §20 patchright + residential proxy stack passes the challenge on first PDP load.** No code changes needed there; the same browser pool serves both retailers.

Notes:
- The CF clearance cookie is per-context. Reuse the same `BrowserContext` across MC fetches for cookie persistence.
- Datacenter IPs from the VPS get blocked harder than residential IPs — proxy is mandatory, not optional.
- One fetch per item per check (not 32) — the all-store inventory blob means we don't fan out per store. CF clearance is cheap relative to that.

### 21.3 URL parsing

Add to `parseUrlOrSku` (renamed to `parseProductInput` if cleaner) a third pattern:

```
^https?://(www\.)?microcenter\.com/product/(\d{4,7})(/.*)?$
```

Returns `{ retailer: 'microcenter', mcProductId: '688173' }`. Bare numeric IDs are NOT accepted for MicroCenter (too ambiguous with Best Buy SKUs); the user must paste the full URL.

### 21.4 Fetch + parse pipeline (`src/lib/microcenter.ts`)

```
1. Acquire patchright context from the shared pool (§20.7).
2. page.goto(`/product/${productId}/x?storeid=029`, { waitUntil: 'domcontentloaded' })
   — slug "x" is fine; the server ignores it.
3. waitForSelector('#pricing, .big-price', { timeout: 10000 }) — truth signal.
4. const html = await page.content()
5. Parse:
   - inventory:  /var inventory\s*=\s*(\[.*?\])\s*;/s   → JSON.parse
   - price:      /<span[^>]*id="pricing"[^>]*content="([0-9.]+)"/  → cents int
   - name/image: JSON-LD Product block (image[0] is canonical)
6. Block heavy resources per §20.6.
7. Return { retailer:'microcenter', productId, name, imageUrl, priceCents, stores: [{storeNumber, storeName, qoh}, ...] }
```

Module exports `fetchMicroCenterProduct(productId)`. Internally re-uses `getOrCreateContext()` from `bestbuy-headless.ts` (rename that file to `headless-pool.ts` and move the BB-specific parsing into `bestbuy-pdp.ts`). Concurrency cap shared with BB (`HEADLESS_CONCURRENCY=3`).

### 21.5 Stock interpretation per (item, store)

For each entry in the response `stores` array, decide using §7's state machine, keyed on `(item_id, store_number)`:

| `qoh` | `last_stock_status` | New status | Action |
|---|---|---|---|
| `> 0` | `OUT_OF_STOCK` / `UNKNOWN` | `IN_STOCK` | Fire alert (if `alert_enabled` and notify-mode allows), set `last_in_stock_at`, schedule reminders |
| `> 0` | `IN_STOCK` | `IN_STOCK` | Fire reminder if `now - last_notified_at >= restock_notify_interval_sec` |
| `=== 0` | `IN_STOCK` | `OUT_OF_STOCK` | No alert; clear reminder schedule |
| `=== 0` | other | `OUT_OF_STOCK` | No-op |

The §6.6 stale-price guard does NOT apply per-store — price is national.

### 21.6 Data model deltas (migration `0005_microcenter.sql`)

```sql
-- New columns on items
ALTER TABLE items ADD COLUMN retailer       TEXT NOT NULL DEFAULT 'bestbuy';  -- 'bestbuy' | 'microcenter'
ALTER TABLE items ADD COLUMN mc_product_id  TEXT;                              -- 6-digit MC product ID; NULL for BB

-- Drop UNIQUE on items.sku (BB-only); enforce uniqueness per-retailer instead.
-- Approach: keep sku NULLABLE for MC rows; add partial uniqueness via index.
DROP INDEX IF EXISTS sqlite_autoindex_items_sku;  -- if present
CREATE UNIQUE INDEX idx_items_bb_sku ON items(sku) WHERE retailer = 'bestbuy';
CREATE UNIQUE INDEX idx_items_mc_pid ON items(mc_product_id) WHERE retailer = 'microcenter';

-- Per-(item, store) state — only populated for retailer='microcenter'
CREATE TABLE item_stores (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id              INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  store_number         TEXT NOT NULL,                            -- '029', '131', etc.
  store_name           TEXT NOT NULL,                            -- 'TX - Dallas' / 'Shippable Items'
  is_online            INTEGER NOT NULL DEFAULT 0,               -- 1 iff store_number = '029'
  alert_enabled        INTEGER NOT NULL DEFAULT 1,               -- per-store opt-in toggle
  last_qoh             INTEGER,
  last_stock_status    TEXT NOT NULL DEFAULT 'UNKNOWN',          -- UNKNOWN | IN_STOCK | OUT_OF_STOCK
  last_in_stock_at     INTEGER,
  last_notified_at     INTEGER,
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL,
  UNIQUE(item_id, store_number)
);

CREATE INDEX idx_item_stores_item ON item_stores(item_id);
```

`stock_events.item_id` continues to reference the parent item. To attribute events to a store, add a nullable `store_number` column:

```sql
ALTER TABLE stock_events ADD COLUMN store_number TEXT;  -- NULL for BB events; set for MC per-store transitions
```

For MC items, the per-item-level `last_stock_status` and `last_in_stock_at` on `items` are denormalized roll-ups: `last_stock_status = 'IN_STOCK'` if ANY enabled `item_stores` row is in stock. These let the dashboard list view stay schema-compatible.

### 21.7 Add-item UI (extends §11)

When `parseProductInput` returns `retailer: 'microcenter'`, the modal shows a MicroCenter branch:

1. **Product preview** — same shape as BB (image, name, price). Stock summary reads "In stock at N of 32 stores" or "Out of stock everywhere".

2. **Alert me on (multi-select dropdown):**
   - Default: all 32 stores checked.
   - The Web Store (`029`) appears at the top as "Online (Shippable)" with a divider below it. Physical stores follow alphabetically by state then city.
   - Quick-action chips above the list: "All" / "In-store only" (selects 31 physical, deselects 029) / "Online only" (selects 029, deselects all physical) / "None" (greys-out the Save button until at least one is selected).
   - Each store row shows its current stock state with a dot indicator (green ⬤ in stock / grey ⬤ OOS / amber ⬤ unknown) so the user can sanity-check before saving.
   - Implementation: combobox/popover with checkboxes (shadcn `Command` + `Popover`). Trigger renders "N of 32 stores selected" or "All stores" / "Online only" / "In-store only" / "{Store name} only" depending on selection shape.

3. **Stock alerts** + **Price alerts** sections behave identically to BB (per §19, §v6 changelog). Stock alerts gate ALL per-store notifications; the per-store dropdown gates which stores' transitions count.

On submit:
- Insert `items` row with `retailer='microcenter'`, `mc_product_id`, `sku=NULL`.
- Insert 32 `item_stores` rows with `alert_enabled` matching the dropdown selection.
- Background: immediately run a check (POST /api/items/:id/check-now) to populate `last_qoh` / `last_stock_status` for each store.

### 21.8 Edit UI

Same dropdown is editable post-creation. Toggling `alert_enabled` for a store does NOT clear its `last_*` state — only its notification gate. If a store was IN_STOCK and gets disabled, the user simply stops receiving its alerts; if re-enabled later, the next OOS→IN_STOCK transition fires normally.

### 21.9 Discord notification payload (extends §8)

For MC items, the per-store alert message format:

```
🟢 In stock at MicroCenter — {store_name}
{product_name}
Price: ${price}
{link to PDP with ?storeid={store_number}}
```

Reminders use the same template with a "↻ Still in stock" header. The PDP URL with the firing store's `?storeid=` lets the user click straight to the per-store availability page.

### 21.10 API routes (extends §10)

- `POST /api/items` — body accepts either `{ url }` (parsed for retailer) or explicit `{ retailer, mcProductId, ... }`. For MC, body also includes `enabledStoreNumbers: string[]` (subset of the 32). Server hydrates `item_stores` rows.
- `PATCH /api/items/:id` — accepts `enabledStoreNumbers` for MC items; diffs against current `item_stores.alert_enabled` and updates.
- `GET /api/items/:id` — response includes `stores: [{storeNumber, storeName, qoh, lastStockStatus, alertEnabled, isOnline}]` for MC items.
- `POST /api/items/:id/check-now` — works unchanged; runs `fetchMicroCenterProduct` instead of BB fetch when `retailer='microcenter'`.

### 21.11 Tests (extends §16)

New test files:

- `microcenter-parse.test.ts` — golden-fixture parsing: feed a saved HTML snapshot, assert `{ stores, priceCents, name, imageUrl }`. Cover the in-stock fixture (MBA 708467) and the all-OOS fixture (Mac mini 688173).
- `microcenter-url.test.ts` — URL parser cases (canonical, with trailing slug variations, malformed).
- `checker.microcenter.test.ts` — state-machine: OOS→IN_STOCK fires per store; disabled store does not fire; reminder schedules respect per-store `last_notified_at`; missing store entry treated as OOS without erroring.
- `notification.microcenter.test.ts` — payload includes correct `?storeid=` deep link and store name.

### 21.12 Out of scope (Phase 2)

- "Notify me when ANY of these N stores has stock" composite alerts (today: each store is independent).
- Geo-distance store ranking in the dropdown.
- Quantity-threshold alerts ("only alert if qoh ≥ 3").
- MC's "Open Box" / "Refurbished" inventory — `var inventory` shows new-only.
- Cart deep-links — MicroCenter has no public add-to-cart URL pattern, unlike BB. Alert links to PDP.
