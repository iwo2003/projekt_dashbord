import { apiError, readJson } from "@/lib/api";
import { clientIp, rateLimited } from "@/lib/auth";
import { shopCheckoutSchema } from "@/lib/schemas";
import { createShopOrder, publicOrder, releaseOrderCode, shopCatalog } from "@/lib/shop";
import { capturePaypal, enabledProviders, shopOrigin, startP24, startPaypal, startStripe, stripePaid } from "@/lib/shop-pay";
import { getShopOrder, setShopOrder } from "@/lib/db";
import { markShopPaid } from "@/lib/shop";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const orderId = new URL(request.url).searchParams.get("order");
  if (orderId) {
    const order = publicOrder(orderId);
    if (!order) return apiError("not_found", 404);
    return Response.json(order);
  }
  return Response.json(shopCatalog((request.headers.get("x-forwarded-host") || request.headers.get("host") || "").split(",")[0] ?? ""));
}

export async function POST(request: Request) {
  const ip = clientIp(request);
  if (rateLimited(`shop:${ip}`, 20)) return apiError("rate_limited", 429);
  const body = await readJson(request);
  const confirm = body && typeof body === "object" && (body as { action?: string }).action === "confirm";
  if (confirm) {
    const id = (body as { id?: string }).id ?? "";
    const order = getShopOrder(id);
    if (!order) return apiError("not_found", 404);
    if (order.status === "pending" && order.provider_ref) {
      try {
        if (order.provider === "stripe" && (await stripePaid(order.provider_ref, order.id))) await markShopPaid(order.id, order.provider_ref);
        if (order.provider === "paypal" && (await capturePaypal(order.provider_ref, order.id))) await markShopPaid(order.id, order.provider_ref);
      } catch {
        setShopOrder(order.id, { error: "payment_failed" });
      }
    }
    return Response.json(publicOrder(order.id));
  }
  const parsed = shopCheckoutSchema.safeParse(body);
  if (!parsed.success) return apiError("validation", 400);
  if (!parsed.data.code?.trim() && !enabledProviders().includes(parsed.data.provider)) return apiError("payment_off", 400);
  let orderId = "";
  try {
    const created = createShopOrder(parsed.data);
    if (!created.ok) return apiError(created.error, 400);
    orderId = created.order.id;
    if (created.order.price_cents === 0) {
      await markShopPaid(orderId, "code");
      return Response.json({ url: `/sklep/powrot?order=${orderId}` });
    }
    const origin = shopOrigin(request);
    const payment =
      parsed.data.provider === "stripe"
        ? await startStripe({ orderId, name: created.order.name, cents: created.order.price_cents, origin, email: created.order.email })
        : parsed.data.provider === "paypal"
          ? await startPaypal({ orderId, name: created.order.name, cents: created.order.price_cents, origin })
          : await startP24({ orderId, name: created.order.name, cents: created.order.price_cents, origin, email: created.order.email });
    setShopOrder(orderId, { providerRef: payment.ref });
    return Response.json({ url: payment.url });
  } catch (error) {
    if (orderId) {
      try {
        setShopOrder(orderId, { status: "failed", error: "payment_failed" });
        releaseOrderCode(orderId);
      } catch {
        /* the buyer still needs the payment error */
      }
    }
    const message = error instanceof Error ? error.message : "payment_failed";
    return apiError("payment_failed", 400, message === "payment_failed" ? undefined : message);
  }
}
