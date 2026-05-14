import { execFile as _execFile } from "node:child_process";

const CURL_CHROME = "/usr/local/bin/curl_chrome116";

function execFileAsync(
  file: string,
  args: string[],
  opts: { timeout?: number; maxBuffer?: number },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    _execFile(file, args, opts, (err, stdout, stderr) => {
      if (err) reject(err);
      else resolve({ stdout: stdout ?? "", stderr: stderr ?? "" });
    });
  });
}

function bestBuyProxyArgs(): string[] | null {
  const pdpProxy = process.env.BESTBUY_PDP_PROXY ?? "";
  const pdpMatch = pdpProxy.match(/^([^:@]+):([^@]*)@([^:]+):(\d+)$/);
  if (pdpMatch) {
    const [, user, pass, host, port] = pdpMatch;
    return ["--proxy", `http://${host}:${port}`, "--proxy-user", `${user}:${pass}`];
  }

  const browserProxy = process.env.BB_PROXY ?? "";
  const browserMatch = browserProxy.match(/^([^:]+):(\d+):([^:]+):(.*)$/);
  if (browserMatch) {
    const [, host, port, user, pass] = browserMatch;
    return ["--proxy", `http://${host}:${port}`, "--proxy-user", `${user}:${pass}`];
  }

  return null;
}

export async function fetchBestBuyLandingHtmlViaProxy(
  url: string,
  timeoutMs: number,
): Promise<{ html: string; finalUrl: string } | null> {
  const proxy = bestBuyProxyArgs();
  if (!proxy) return null;

  const args = [
    ...proxy,
    "-s",
    "-L",
    "--compressed",
    "--max-time",
    String(Math.max(5, Math.ceil(timeoutMs / 1000))),
    "-w",
    "\n---CURLINFO---\nurl_effective=%{url_effective}",
    "-H",
    "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36",
    "-H",
    "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "-H",
    "Accept-Language: en-US,en;q=0.9",
    "-H",
    'Sec-CH-UA: "Chromium";v="116", "Not)A;Brand";v="24", "Google Chrome";v="116"',
    "-H",
    "Sec-CH-UA-Mobile: ?0",
    "-H",
    'Sec-CH-UA-Platform: "macOS"',
    url,
  ];

  try {
    const { stdout } = await execFileAsync(CURL_CHROME, args, {
      timeout: timeoutMs + 3_000,
      maxBuffer: 3 * 1024 * 1024,
    });
    const infoIdx = stdout.indexOf("\n---CURLINFO---\n");
    const html = infoIdx >= 0 ? stdout.slice(0, infoIdx) : stdout;
    const info = infoIdx >= 0 ? stdout.slice(infoIdx) : "";
    const finalUrl = (info.match(/url_effective=(.+)/) ?? [])[1]?.trim() ?? url;
    return { html, finalUrl };
  } catch {
    return null;
  }
}
