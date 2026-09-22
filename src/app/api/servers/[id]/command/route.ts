import { apiError, guard, readJson } from "@/lib/api";
import { getServer } from "@/lib/db";
import { commandSchema } from "@/lib/schemas";
import { sendCommand } from "@/lib/servers";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await guard("servers.console");
  if (auth.error) return auth.error;
  const parsed = commandSchema.safeParse(await readJson(request));
  if (!parsed.success) return apiError("validation", 400);
  const { id } = await ctx.params;
  const server = getServer(id);
  if (!server) return apiError("not_found", 404);
  try {
    const result = await sendCommand(server, parsed.data.command);
    if (!result.ok) return apiError(result.error, 409);
    return Response.json({ output: result.output });
  } catch (error) {
    const message = error instanceof Error ? error.message : "request_failed";
    if (message === "server_offline" || message === "rcon_auth" || message === "rcon_timeout") {
      return apiError(message === "rcon_auth" ? "forbidden" : "server_offline", 409);
    }
    console.error(error);
    return apiError("request_failed", 500);
  }
}
