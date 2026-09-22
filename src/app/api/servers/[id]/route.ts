import { apiError, guard, readJson } from "@/lib/api";
import { getServer } from "@/lib/db";
import { updateServerSchema } from "@/lib/schemas";
import { applySettings, destroyServer, syncServer, toPublicServer } from "@/lib/servers";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const auth = await guard("servers.view");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const server = getServer(id);
  if (!server) return apiError("not_found", 404);
  return Response.json({ server: toPublicServer(await syncServer(server), auth.user) });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await guard("servers.settings");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const parsed = updateServerSchema.safeParse(await readJson(request));
  if (!parsed.success) return apiError("validation", 400);
  const result = await applySettings(auth.user, id, parsed.data);
  if (!result.ok) {
    const status = result.error === "not_found" ? 404 : result.error === "docker_offline" ? 503 : 409;
    return apiError(result.error, status);
  }
  return Response.json({ server: toPublicServer(result.server, auth.user) });
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const auth = await guard("servers.delete");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const result = await destroyServer(auth.user, id);
  if (!result.ok) {
    const status = result.error === "docker_offline" ? 503 : 404;
    return apiError(result.error, status);
  }
  return Response.json({ ok: true });
}
