import { markShopPaid } from "@/lib/shop";
import { stripeEvent } from "@/lib/shop-pay";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const payload = await request.text();
  const orderId = stripeEvent(payload, request.headers.get("stripe-signature") ?? "");
  if (orderId) await markShopPaid(orderId);
  return NextResponse.json({ received: true });
}
