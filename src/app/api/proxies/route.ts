import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  addProxyLines,
  clearProxies,
  listProxies,
  replaceProxyLines,
} from "@/lib/proxies";

const ProxyBodySchema = z.object({
  proxies: z.array(z.string().max(500)).max(1000).optional(),
  text: z.string().max(500_000).optional(),
});

function firstZodIssue(err: z.ZodError): string {
  const issue = err.issues[0];
  if (!issue) return "Invalid request body";
  const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
  return `${path}${issue.message}`;
}

function bodyToText(body: z.infer<typeof ProxyBodySchema>): string {
  return body.text ?? body.proxies?.join("\n") ?? "";
}

async function parseProxyBody(req: NextRequest): Promise<string | NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = ProxyBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstZodIssue(parsed.error) }, { status: 400 });
  }

  const text = bodyToText(parsed.data);
  if (text.trim() === "") {
    return NextResponse.json({ error: "At least one proxy is required" }, { status: 400 });
  }
  return text;
}

export async function GET() {
  try {
    const rows = listProxies();
    return NextResponse.json({ proxies: rows, count: rows.length });
  } catch (err) {
    console.error("[GET /api/proxies]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const text = await parseProxyBody(req);
  if (text instanceof NextResponse) return text;

  try {
    const result = addProxyLines(text);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid proxy list";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PUT(req: NextRequest) {
  const text = await parseProxyBody(req);
  if (text instanceof NextResponse) return text;

  try {
    const result = replaceProxyLines(text);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid proxy list";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE() {
  try {
    return NextResponse.json(clearProxies());
  } catch (err) {
    console.error("[DELETE /api/proxies]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
