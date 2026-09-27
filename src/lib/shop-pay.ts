import { createHash, createHmac, timingSafeEqual } from "crypto";
import { getSetting } from "./db";

export type ShopProvider = "stripe" | "paypal" | "p24";

function sha384(value: string) {
  return createHash("sha384").update(value).digest("hex");
}

export function shopOrigin(request: Request) {
  const shop = getSetting("shop_host");
  if (shop) return `https://${shop}`;
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host") || url.host;
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto = forwardedProto === "https" || request.headers.get("cf-ray") ? "https" : forwardedProto || url.protocol.replace(":", "");
  return `${proto}://${host.replace(/:443$/, "").replace(/:80$/, "")}`;
}

export function enabledProviders() {
  const list: ShopProvider[] = [];
  if (getSetting("shop_stripe") === "1" && getSetting("shop_stripe_secret")) list.push("stripe");
  if (getSetting("shop_paypal") === "1" && getSetting("shop_paypal_client") && getSetting("shop_paypal_secret")) list.push("paypal");
  if (getSetting("shop_p24") === "1" && getSetting("shop_p24_merchant") && getSetting("shop_p24_crc") && getSetting("shop_p24_api")) list.push("p24");
  return list;
}

function paypalBase() {
  return getSetting("shop_paypal_sandbox") === "1" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
}

function p24Base() {
  return getSetting("shop_p24_sandbox") === "1" ? "https://sandbox.przelewy24.pl" : "https://secure.przelewy24.pl";
}

async function paypalToken() {
  const id = getSetting("shop_paypal_client");
  const secret = getSetting("shop_paypal_secret");
  const response = await fetch(`${paypalBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const data = (await response.json()) as { access_token?: string };
  if (!response.ok || !data.access_token) throw new Error("payment_failed");
  return data.access_token;
}

export function readStripeSecret(value: string) {
  const compact = value.replace(/\s+/g, "");
  const found = compact.match(/(?:sk|rk)_(?:live|test)_[A-Za-z0-9]+/);
  if (found) return { ok: true as const, secret: found[0] };
  if (/pk_(?:live|test)_/.test(compact)) return { ok: false as const, error: "stripe_publishable" as const };
  return { ok: false as const, error: "stripe_key" as const };
}

export async function startStripe(input: { orderId: string; name: string; cents: number; origin: string; email: string }) {
  const read = readStripeSecret(getSetting("shop_stripe_secret"));
  if (!read.ok) throw new Error(read.error);
  const body = new URLSearchParams();
  body.set("mode", "payment");
  body.set("success_url", `${input.origin}/sklep/powrot?order=${input.orderId}`);
  body.set("cancel_url", `${input.origin}/sklep?cancelled=1`);
  body.set("customer_email", input.email);
  body.set("client_reference_id", input.orderId);
  body.set("metadata[order]", input.orderId);
  body.set("line_items[0][quantity]", "1");
  body.set("line_items[0][price_data][currency]", "pln");
  body.set("line_items[0][price_data][unit_amount]", String(input.cents));
  body.set("line_items[0][price_data][product_data][name]", input.name.slice(0, 120) || "Produkt");
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${read.secret}` },
    body,
    signal: AbortSignal.timeout(12000),
  });
  const data = (await response.json().catch(() => ({}))) as { id?: string; url?: string; error?: { message?: string } };
  if (!response.ok || !data.url || !data.id) throw new Error(stripeMessage(data.error?.message));
  return { ref: data.id, url: data.url };
}

function stripeMessage(message: string | undefined) {
  const clean = (message ?? "").replace(/sk_(live|test)_[A-Za-z0-9]+/g, "sk_$1_…").replace(/\s+/g, " ").trim();
  return clean || "payment_failed";
}

export async function stripePaid(sessionId: string, orderId: string) {
  const read = readStripeSecret(getSetting("shop_stripe_secret"));
  if (!read.ok) return false;
  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
    headers: { Authorization: `Bearer ${read.secret}` },
  });
  const data = (await response.json()) as { payment_status?: string; client_reference_id?: string; metadata?: { order?: string } };
  if (!response.ok || data.payment_status !== "paid") return false;
  return data.client_reference_id === orderId || data.metadata?.order === orderId;
}

export function stripeEvent(payload: string, header: string) {
  const secret = getSetting("shop_stripe_webhook");
  if (!secret || !header) return null;
  const parts = Object.fromEntries(header.split(",").map((part) => part.split("=") as [string, string]));
  const signed = `${parts.t}.${payload}`;
  const expected = createHmac("sha256", secret).update(signed).digest("hex");
  const given = parts.v1 ?? "";
  if (expected.length !== given.length) return null;
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(given))) return null;
  const event = JSON.parse(payload) as { type?: string; data?: { object?: { client_reference_id?: string; metadata?: { order?: string }; payment_status?: string; id?: string } } };
  if (event.type !== "checkout.session.completed" || event.data?.object?.payment_status !== "paid") return null;
  return event.data.object.client_reference_id || event.data.object.metadata?.order || "";
}

export async function startPaypal(input: { orderId: string; name: string; cents: number; origin: string }) {
  const token = await paypalToken();
  const response = await fetch(`${paypalBase()}/v2/checkout/orders`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: input.orderId,
          description: input.name.slice(0, 120),
          amount: { currency_code: "PLN", value: (input.cents / 100).toFixed(2) },
        },
      ],
      application_context: {
        return_url: `${input.origin}/sklep/powrot?order=${input.orderId}`,
        cancel_url: `${input.origin}/sklep?cancelled=1`,
        user_action: "PAY_NOW",
      },
    }),
  });
  const data = (await response.json()) as { id?: string; links?: { rel: string; href: string }[] };
  const url = data.links?.find((link) => link.rel === "approve")?.href;
  if (!response.ok || !data.id || !url) throw new Error("payment_failed");
  return { ref: data.id, url };
}

export async function capturePaypal(ref: string, orderId: string) {
  const token = await paypalToken();
  const response = await fetch(`${paypalBase()}/v2/checkout/orders/${ref}/capture`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const data = (await response.json()) as { status?: string; purchase_units?: { reference_id?: string }[] };
  if (!response.ok || (data.status !== "COMPLETED" && data.status !== "APPROVED")) return false;
  const reference = data.purchase_units?.[0]?.reference_id;
  return !reference || reference === orderId;
}

export async function startP24(input: { orderId: string; name: string; cents: number; origin: string; email: string }) {
  const merchantId = Number(getSetting("shop_p24_merchant"));
  const crc = getSetting("shop_p24_crc");
  const sign = sha384(JSON.stringify({ sessionId: input.orderId, merchantId, amount: input.cents, currency: "PLN", crc }));
  const response = await fetch(`${p24Base()}/api/v1/transaction/register`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${merchantId}:${getSetting("shop_p24_api")}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      merchantId,
      posId: merchantId,
      sessionId: input.orderId,
      amount: input.cents,
      currency: "PLN",
      description: input.name.slice(0, 120),
      email: input.email,
      country: "PL",
      language: "pl",
      urlReturn: `${input.origin}/sklep/powrot?order=${input.orderId}`,
      urlStatus: `${input.origin}/api/shop/p24`,
      sign,
    }),
  });
  const data = (await response.json()) as { data?: { token?: string } };
  if (!response.ok || !data.data?.token) throw new Error("payment_failed");
  return { ref: input.orderId, url: `${p24Base()}/trnRequest/${data.data.token}` };
}

export async function verifyP24(body: { sessionId?: string; orderId?: number; amount?: number; currency?: string; sign?: string }) {
  const merchantId = Number(getSetting("shop_p24_merchant"));
  const crc = getSetting("shop_p24_crc");
  if (!body.sessionId || body.orderId == null || body.amount == null || !body.sign) return "";
  const expected = sha384(JSON.stringify({ sessionId: body.sessionId, orderId: body.orderId, amount: body.amount, currency: body.currency ?? "PLN", crc }));
  if (expected.length !== body.sign.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(body.sign))) return "";
  const sign = sha384(JSON.stringify({ sessionId: body.sessionId, orderId: body.orderId, amount: body.amount, currency: body.currency ?? "PLN", crc }));
  const response = await fetch(`${p24Base()}/api/v1/transaction/verify`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${merchantId}:${getSetting("shop_p24_api")}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      merchantId,
      posId: merchantId,
      sessionId: body.sessionId,
      amount: body.amount,
      currency: body.currency ?? "PLN",
      orderId: body.orderId,
      sign,
    }),
  });
  if (!response.ok) return "";
  return body.sessionId;
}
