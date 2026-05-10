# Project: inventory-checker

## Deployment model — overrides global CLAUDE.md

This project does NOT use Vercel + Railway + Supabase (the global default). It uses:

- **Hosting:** single VPS for both frontend and backend, pm2-managed (Next.js app + separate `worker.ts` Node process).
- **Database:** local SQLite file (better-sqlite3, WAL mode) shared between both processes.
- **Auth:** Cloudflare Access at the edge (email allowlist). No app-level auth.

When this conflicts with global rules around binding to `0.0.0.0`, reading `PORT` from env, etc., the local model wins. The Next.js app binds to localhost and is reverse-proxied by Cloudflare Tunnel/origin firewall — there is no Railway-style `PORT` requirement.

## Source of truth

`SPEC.md` is the authoritative design. Before implementing anything:
1. Read SPEC.md sections relevant to the change.
2. If the work conflicts with the spec, update the spec first (with a changelog entry in §0) and surface the change to the user.

## Stock detection — non-obvious requirements

- **MUST use Node `fetch` / undici, not curl.** Best Buy's edge does TLS fingerprinting; curl gets dropped at the protocol layer with zero useful response. (Verified during the §6 spike.)
- Required headers: `User-Agent` (Chrome desktop), `Accept: application/json`, `Accept-Language: en-US,en;q=0.9`, `Referer: https://www.bestbuy.com/`.
- Endpoint: `GET https://www.bestbuy.com/api/3.0/priceBlocks?skus={SKU}` (or comma-separated batch).
- Image is NOT in the API response — derive from CDN: `https://pisces.bbystatic.com/image2/BestBuy_US/images/products/{sku.slice(0,4)}/{sku}_sd.jpg`.

## Testing discipline

Per Codex round-1: the §16 test suite is non-negotiable. URL parser, stock interpretation, transition logic, concurrency, notification payload — all need unit tests before v1 ships.
