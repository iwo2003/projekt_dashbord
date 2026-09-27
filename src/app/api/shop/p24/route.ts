import { markShopPaid } from "@/lib/shop";
import { verifyP24 } from "@/lib/shop-pay";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    sessionId?: string;
    orderId?: number;
    amount?: number;
    currency?: string;
    sign?: string;
  } | null;
  if (!body) return NextResponse.json({ ok: false }, { status: 400 });
  const sessionId = await verifyP24(body);
  if (sessionId) await markShopPaid(sessionId);
  return NextResponse.json({ ok: Boolean(sessionId) });
}
