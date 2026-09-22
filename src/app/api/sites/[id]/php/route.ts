import { apiError, guard, readJson } from "@/lib/api";
import { getSiteRow, logEvent } from "@/lib/db";
import { setSitePhp } from "@/lib/sites";

export const runtime = "nodejs";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await guard("sites.manage");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const site = getSiteRow(id);
  if (!site) return apiError("not_found", 404);
  const body = (await readJson(request)) as { enabled?: boolean } | null;
  if (typeof body?.enabled !== "boolean") return apiError("validation", 400);
  const result = await setSitePhp(id, body.enabled);
  if (!result.ok) {
    const status = result.error === "php_failed" || result.error === "site_failed" ? 502 : 404;
    return apiError(result.error, status, "detail" in result ? result.detail : undefined);
  }
  logEvent(auth.user, "site.php", { name: site.name, domain: site.domain, php: body.enabled ? 1 : 0 });
  return Response.json({ ok: true });
}
