import { apiError, guard, readJson } from "@/lib/api";
import { powerSchema } from "@/lib/schemas";
import { powerServer, toPublicServer } from "@/lib/servers";

export const runtime = "nodejs";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await guard("servers.power");
  if (auth.error) return auth.error;
  const parsed = powerSchema.safeParse(await readJson(request));
  if (!parsed.success) return apiError("validation", 400);
  const { id } = await ctx.params;
  try {
    const result = await powerServer(auth.user, id, parsed.data.action);
    if (!result.ok) {
      const status = result.error === "not_found" ? 404 : result.error === "docker_offline" ? 503 : 409;
      return apiError(result.error, status);
    }
    return Response.json({ server: toPublicServer(result.server, auth.user) });
  } catch (error) {
    console.error(error);
    if (error instanceof Error && error.message === "plugins_failed") return apiError("plugins_failed", 502);
    return apiError("request_failed", 500);
  }
}
