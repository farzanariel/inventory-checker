import { NextResponse } from "next/server";

import { removeProxyAt } from "@/lib/proxies";

function parseIndex(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

export async function DELETE(
  _req: Request,
  ctx: RouteContext<"/api/proxies/[index]">,
) {
  const { index: rawIndex } = await ctx.params;
  const index = parseIndex(rawIndex);
  if (index === null) {
    return NextResponse.json({ error: "Invalid proxy index" }, { status: 400 });
  }

  try {
    const result = removeProxyAt(index);
    if (!result.removed) {
      return NextResponse.json({ error: "Proxy not found" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("[DELETE /api/proxies/:index]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
