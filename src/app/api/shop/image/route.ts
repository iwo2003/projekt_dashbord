import fs from "fs/promises";
import { apiError, guard } from "@/lib/api";
import { getShopProduct } from "@/lib/db";
import { saveShopImage, shopAdminState, shopImageFile, shopImageMime } from "@/lib/shop";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const product = getShopProduct(id);
  const file = product?.image ? shopImageFile(product.image) : null;
  if (!product || !file) return apiError("not_found", 404);
  try {
    const bytes = await fs.readFile(file);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": shopImageMime(product.image),
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return apiError("not_found", 404);
  }
}

export async function POST(request: Request) {
  const auth = await guard("shop.manage");
  if (auth.error) return auth.error;
  const form = await request.formData();
  const id = String(form.get("id") ?? "");
  const file = form.get("file");
  if (!(file instanceof File) || !id) return apiError("validation", 400);
  const saved = await saveShopImage(id, Buffer.from(await file.arrayBuffer()));
  if (!saved.ok) return apiError(saved.error, saved.error === "too_large" ? 413 : 400);
  return Response.json(shopAdminState());
}
