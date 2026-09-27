import { after } from "next/server";
import { apiError, guard, readJson } from "@/lib/api";
import { logEvent } from "@/lib/db";
import { refreshCaddyRoutes } from "@/lib/https";
import { shopCodeSchema, shopProductSchema, shopSettingsSchema } from "@/lib/schemas";
import { installShopPlugin, removeShopCode, removeShopProduct, saveShopCode, saveShopProduct, saveShopSettings, shopAdminState } from "@/lib/shop";
import { deliverOrder } from "@/lib/shop";

export const runtime = "nodejs";

export async function GET() {
  const auth = await guard("shop.view");
  if (auth.error) return auth.error;
  return Response.json(shopAdminState());
}

export async function PUT(request: Request) {
  const auth = await guard("shop.manage");
  if (auth.error) return auth.error;
  const parsed = shopSettingsSchema.safeParse(await readJson(request));
  if (!parsed.success) return apiError("validation", 400);
  const saved = await saveShopSettings(parsed.data);
  if (!saved.ok) return apiError(saved.error, 400);
  if (saved.hostChanged) {
    after(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await refreshCaddyRoutes().catch(() => undefined);
    });
  }
  logEvent(auth.user, "shop.settings");
  return Response.json(shopAdminState());
}

export async function POST(request: Request) {
  const auth = await guard("shop.manage");
  if (auth.error) return auth.error;
  const body = await readJson(request);
  const install = body && typeof body === "object" && (body as { action?: string }).action === "install";
  if (install) {
    const serverId = (body as { serverId?: string }).serverId ?? "";
    const result = await installShopPlugin(serverId);
    if (!result.ok) return apiError(result.error, 400);
    logEvent(auth.user, "shop.plugin", { server: serverId });
    return Response.json({ ok: true, token: result.token });
  }
  const force = body && typeof body === "object" && (body as { action?: string }).action === "send";
  if (force) {
    const id = (body as { id?: string }).id ?? "";
    await deliverOrder(id, true);
    logEvent(auth.user, "shop.deliver", { order: id });
    return Response.json(shopAdminState());
  }
  const code = shopCodeSchema.safeParse(body);
  if (code.success) {
    const saved = saveShopCode({
      kind: code.data.kind,
      code: code.data.code,
      mode: code.data.mode,
      percent: code.data.percent,
      amountCents: code.data.amountZl ? Math.round(code.data.amountZl * 100) : 0,
      uses: code.data.uses,
    });
    if (!saved.ok) return apiError(saved.error, 400);
    logEvent(auth.user, "shop.code", { code: code.data.code });
    return Response.json(shopAdminState());
  }
  const parsed = shopProductSchema.safeParse(body);
  if (!parsed.success) return apiError("validation", 400);
  const saved = saveShopProduct({
    ...parsed.data,
    priceCents: Math.round(parsed.data.priceZl * 100),
  });
  if (!saved.ok) return apiError(saved.error, 400);
  logEvent(auth.user, "shop.product", { name: parsed.data.name });
  return Response.json(shopAdminState());
}

export async function DELETE(request: Request) {
  const auth = await guard("shop.manage");
  if (auth.error) return auth.error;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const codeId = new URL(request.url).searchParams.get("code") ?? "";
  if (codeId) {
    removeShopCode(codeId);
    logEvent(auth.user, "shop.code", { id: codeId });
    return Response.json(shopAdminState());
  }
  const removed = removeShopProduct(id);
  if (!removed.ok) return apiError(removed.error, 404);
  logEvent(auth.user, "shop.product", { id });
  return Response.json(shopAdminState());
}
