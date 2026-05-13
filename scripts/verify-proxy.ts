/**
 * Quick proxy verification script for NEC-35 / NEC-37
 *
 * Usage:
 *   PROXY=host:port:user:pass npx tsx scripts/verify-proxy.ts
 *   PROXY=host:port:user:pass SKU=6587182 npx tsx scripts/verify-proxy.ts
 *
 * Tests:
 *   1. Direct IP geolookup through the proxy (confirms US residential exit)
 *   2. Sticky session test (2 requests with same session token => same IP)
 *   3. Best Buy homepage via patchright (warmup + _abck check)
 *   4. Best Buy PDP scrape (real SKU check)
 */
import { scrapePdpForSku, closePool } from "../src/lib/bestbuy-headless";

const SKU = process.env.SKU ?? "6587182";
const PROXY = process.env.PROXY ?? process.env.BB_PROXY;
const SESSION_ID = process.env.SESSION_ID ?? `verify-${Date.now()}`;

/**
 * Build a curl-compatible proxy URL string: http://user:pass@host:port
 * Optionally append a session token to the username for sticky-session
 * providers that use the username-session-{id} convention (e.g. IPRoyal).
 * onestopproxies.cc uses a different sticky mechanism — pass sessionId=""
 * to skip the session suffix.
 */
function buildCurlProxy(proxy: string, sessionId: string): string {
  const parts = proxy.split(":");
  if (parts.length === 4) {
    const [host, port, user, pass] = parts;
    const userWithSession = sessionId
      ? `${user}-session-${sessionId}`
      : user;
    return `http://${userWithSession}:${pass}@${host}:${port}`;
  }
  if (parts.length === 2) {
    return `http://${parts[0]}:${parts[1]}`;
  }
  return proxy;
}

async function main() {
  if (!PROXY) {
    console.error("❌ No proxy provided. Set PROXY or BB_PROXY.");
    console.error("   Format: host:port:username:password");
    process.exit(1);
  }

  // onestopproxies.cc doesn't need a session suffix — the username already
  // encodes -country-us; pass empty sessionId to skip the suffix.
  const curlProxy = buildCurlProxy(PROXY, "");

  console.log(`🔍 Proxy verification for NEC-35`);
  console.log(`   Proxy:      ${PROXY.split(":").slice(0, 2).join(":")}:****:****`);
  console.log(`   Session:    ${SESSION_ID}`);
  console.log(`   SKU:        ${SKU}`);
  console.log("");

  // Step 1: HTTP proxy test via curl
  console.log("📡 Step 1: Direct HTTP proxy test");
  const { execSync } = await import("child_process");
  try {
    const ip = execSync(
      `curl -x "${curlProxy}" -s --connect-timeout 10 --max-time 15 https://api.ipify.org`,
      { encoding: "utf8", timeout: 20000 }
    ).trim();
    console.log(`   ✅ Proxy reachable — exit IP: ${ip}`);
  } catch (e: any) {
    console.log(`   ❌ Proxy unreachable: ${e.message?.slice(0, 80)}`);
    process.exit(1);
  }

  // Step 2: Sticky session check
  console.log("\n🔄 Step 2: Sticky session check");
  try {
    const ips: string[] = [];
    for (let i = 0; i < 3; i++) {
      const ip = execSync(
        `curl -x "${curlProxy}" -s --connect-timeout 10 --max-time 15 https://api.ipify.org`,
        { encoding: "utf8", timeout: 20000 }
      ).trim();
      ips.push(ip);
    }
    const sticky = ips.every((ip) => ip === ips[0]);
    if (sticky) {
      console.log(`   ✅ Sticky session: all requests used ${ips[0]}`);
    } else {
      console.log(`   ⚠️  Not sticky (rotating): ${ips.join(", ")}`);
      console.log(`   ℹ  For patchright, sticky session is maintained by the browser context`);
      console.log(`     (same TCP connection to the proxy throughout a page load)`);
    }
  } catch (e: any) {
    console.log(`   ❌ Sticky test failed: ${e.message?.slice(0, 80)}`);
  }

  // Step 3: Headless PDP scrape
  console.log(`\n🕵️ Step 3: Headless PDP scrape (SKU ${SKU})`);
  try {
    const result = await scrapePdpForSku(SKU, {
      proxy: PROXY,
      timeoutMs: 60000,
      warmupTimeoutMs: 40000,
    });
    if (result.ok) {
      const inStock = result.purchasable || result.buttonState === "ADD_TO_CART";
      console.log(`   ✅ PDP scrape OK`);
      console.log(`      Price:   $${(result.currentPriceCents / 100).toFixed(2)}`);
      console.log(`      Stock:   ${inStock ? "In stock" : "Out of stock"}`);
      console.log(`      Name:    ${result.name}`);
    } else {
      console.log(`   ❌ PDP scrape failed: ${result.error}`);
    }
  } catch (e: any) {
    console.log(`   ❌ Scrape error: ${e.message?.slice(0, 100)}`);
  }
  await closePool();

  console.log("\n📋 Done.");
}

main();
