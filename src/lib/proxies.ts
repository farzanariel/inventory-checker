import { asc, eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { proxies, type Proxy } from "@/lib/db/schema";

export type ProxyInput = {
  host: string;
  port: number;
  username: string | null;
  password: string | null;
};

export type ProxyDto = ProxyInput & {
  id: number;
  created_at: number;
};

let proxyCursor = 0;

function stripProtocol(raw: string): string {
  return raw.trim().replace(/^https?:\/\//i, "");
}

function parsePort(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const port = Number.parseInt(raw, 10);
  if (port < 1 || port > 65535) return null;
  return port;
}

function cleanPart(value: string): string {
  return decodeURIComponent(value.trim());
}

function validateHost(host: string): void {
  if (!host || /\s/.test(host)) {
    throw new Error("Host is required and cannot contain spaces");
  }
}

export function parseProxyLine(line: string): ProxyInput {
  const raw = stripProtocol(line);
  if (!raw) {
    throw new Error("Proxy line is empty");
  }

  if (raw.includes("@")) {
    const [authRaw, targetRaw] = raw.split("@", 2);
    const authIdx = authRaw.indexOf(":");
    if (authIdx <= 0) {
      throw new Error("Auth proxy must use user:pass@host:port");
    }
    const targetIdx = targetRaw.lastIndexOf(":");
    if (targetIdx <= 0) {
      throw new Error("Auth proxy must include host:port");
    }
    const username = cleanPart(authRaw.slice(0, authIdx));
    const password = cleanPart(authRaw.slice(authIdx + 1));
    const host = cleanPart(targetRaw.slice(0, targetIdx));
    const port = parsePort(targetRaw.slice(targetIdx + 1));
    validateHost(host);
    if (!username) throw new Error("Username is required");
    if (port === null) throw new Error("Port must be between 1 and 65535");
    return { host, port, username, password };
  }

  const parts = raw.split(":");
  if (parts.length !== 2 && parts.length !== 4) {
    throw new Error("Expected host:port, host:port:user:pass, or user:pass@host:port");
  }

  const host = cleanPart(parts[0]);
  const port = parsePort(parts[1]);
  validateHost(host);
  if (port === null) throw new Error("Port must be between 1 and 65535");

  if (parts.length === 2) {
    return { host, port, username: null, password: null };
  }

  const username = cleanPart(parts[2]);
  const password = cleanPart(parts[3]);
  if (!username) throw new Error("Username is required");
  return { host, port, username, password };
}

export function parseProxyLines(text: string): ProxyInput[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return parseProxyLine(line);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Invalid proxy";
        throw new Error(`Line ${index + 1}: ${message}`);
      }
    });
}

export function formatBrowserProxy(proxy: ProxyInput): string {
  if (proxy.username !== null) {
    return `${proxy.host}:${proxy.port}:${proxy.username}:${proxy.password ?? ""}`;
  }
  return `${proxy.host}:${proxy.port}`;
}

export function formatCurlProxy(proxy: ProxyInput): string[] {
  const args = ["--proxy", `http://${proxy.host}:${proxy.port}`];
  if (proxy.username !== null) {
    args.push("--proxy-user", `${proxy.username}:${proxy.password ?? ""}`);
  }
  return args;
}

export function formatProxyLine(proxy: ProxyInput): string {
  if (proxy.username !== null) {
    return `${proxy.host}:${proxy.port}:${proxy.username}:${proxy.password ?? ""}`;
  }
  return `${proxy.host}:${proxy.port}`;
}

function toDto(row: Proxy): ProxyDto {
  return {
    id: row.id,
    host: row.host,
    port: row.port,
    username: row.username,
    password: row.password,
    created_at: row.createdAt,
  };
}

function uniqueProxyInputs(rows: ProxyInput[]): ProxyInput[] {
  const seen = new Set<string>();
  const unique: ProxyInput[] = [];
  for (const row of rows) {
    const key = formatProxyLine(row);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
  }
  return unique;
}

export function listProxies(): ProxyDto[] {
  const db = getDb();
  return db.select().from(proxies).orderBy(asc(proxies.id)).all().map(toDto);
}

export function addProxyLines(text: string): { added: number; total: number; proxies: ProxyDto[] } {
  const parsed = uniqueProxyInputs(parseProxyLines(text));
  const db = getDb();
  const now = Date.now();
  let added = 0;
  const existing = new Set(listProxies().map(formatProxyLine));

  for (const proxy of parsed) {
    const key = formatProxyLine(proxy);
    if (existing.has(key)) continue;
    const result = db
      .insert(proxies)
      .values({ ...proxy, createdAt: now })
      .onConflictDoNothing()
      .run();
    added += result.changes;
    if (result.changes > 0) existing.add(key);
  }

  const rows = listProxies();
  return { added, total: rows.length, proxies: rows };
}

export function replaceProxyLines(text: string): { replaced: number; total: number; proxies: ProxyDto[] } {
  const parsed = uniqueProxyInputs(parseProxyLines(text));
  const db = getDb();
  const now = Date.now();

  db.transaction((tx) => {
    tx.delete(proxies).run();
    for (const proxy of parsed) {
      tx.insert(proxies).values({ ...proxy, createdAt: now }).run();
    }
  });

  const rows = listProxies();
  return { replaced: parsed.length, total: rows.length, proxies: rows };
}

export function removeProxyAt(index: number): { removed: boolean; proxies: ProxyDto[] } {
  const rows = listProxies();
  const target = rows[index];
  if (!target) {
    return { removed: false, proxies: rows };
  }
  const db = getDb();
  db.delete(proxies).where(eq(proxies.id, target.id)).run();
  return { removed: true, proxies: listProxies() };
}

export function clearProxies(): { cleared: number; proxies: ProxyDto[] } {
  const db = getDb();
  const result = db.delete(proxies).run();
  proxyCursor = 0;
  return { cleared: result.changes, proxies: [] };
}

export function getNextProxy(): ProxyDto | null {
  const rows = listProxies();
  if (rows.length === 0) return null;
  const proxy = rows[proxyCursor % rows.length];
  proxyCursor = (proxyCursor + 1) % rows.length;
  return proxy;
}

export async function getBrowserProxyLine(): Promise<string | undefined> {
  const saved = getNextProxy();
  if (saved) return formatBrowserProxy(saved);
  const env = process.env.BB_PROXY?.trim();
  if (env) return env;
  const pdpEnv = process.env.BESTBUY_PDP_PROXY?.trim();
  if (!pdpEnv) return undefined;
  try {
    return formatBrowserProxy(parseProxyLine(pdpEnv));
  } catch {
    return undefined;
  }
}

export async function getBestBuyCurlProxyArgs(): Promise<string[] | null> {
  const saved = getNextProxy();
  if (saved) return formatCurlProxy(saved);

  const pdpEnv = process.env.BESTBUY_PDP_PROXY?.trim();
  if (pdpEnv) {
    try {
      return formatCurlProxy(parseProxyLine(pdpEnv));
    } catch {
      console.warn("[proxy] BESTBUY_PDP_PROXY format invalid");
    }
  }

  const browserEnv = process.env.BB_PROXY?.trim();
  if (browserEnv) {
    try {
      return formatCurlProxy(parseProxyLine(browserEnv));
    } catch {
      console.warn("[proxy] BB_PROXY format invalid");
    }
  }

  return null;
}
