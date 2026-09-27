import { guard } from "@/lib/api";
import { downloadShopPlugin } from "@/lib/shop";
import { pluginZipName, zipStore } from "@/lib/shop-plugin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await guard("shop.manage");
  if (auth.error) return auth.error;
  const serverId = new URL(request.url).searchParams.get("server") ?? "";
  const pack = downloadShopPlugin(serverId);
  if (!pack) return Response.json({ error: "not_found" }, { status: 404 });
  const zip = zipStore(pack.files);
  return new Response(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${pluginZipName(pack.game)}"`,
    },
  });
}
