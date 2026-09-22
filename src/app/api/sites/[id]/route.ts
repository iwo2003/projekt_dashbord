import { apiError, guard } from "@/lib/api";
import { getSiteRow, logEvent } from "@/lib/db";
import { removeSite } from "@/lib/sites";

export const runtime = "nodejs";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, ctx: Ctx) {
  const auth = await guard("sites.manage");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const site = getSiteRow(id);
  if (!site) return apiError("not_found", 404);
  const removed = await removeSite(id);
  if (!removed.ok) return apiError(removed.error, removed.error === "site_failed" ? 502 : 404);
  logEvent(auth.user, "site.delete", { name: site.name, domain: site.domain });
  return Response.json({ ok: true });
}
