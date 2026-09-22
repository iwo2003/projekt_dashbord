import { NextResponse } from "next/server";
import { apiError, guard, readJson } from "@/lib/api";
import { getServer, logEvent } from "@/lib/db";
import { playerAction, playerSnapshot } from "@/lib/players";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const auth = await guard("servers.console");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const server = getServer(id);
  if (!server) return apiError("not_found", 404);
  try {
    const snapshot = await playerSnapshot(server);
    if (!snapshot.ok) return apiError(snapshot.error, snapshot.error === "server_offline" ? 409 : 502);
    return NextResponse.json(snapshot);
  } catch (error) {
    const code = error instanceof Error ? error.message : "request_failed";
    return apiError(code === "server_offline" || code === "rcon_timeout" || code === "rcon_auth" ? code : "request_failed", 502);
  }
}

export async function POST(request: Request, ctx: Ctx) {
  const auth = await guard("servers.power");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const server = getServer(id);
  if (!server) return apiError("not_found", 404);
  const body = (await readJson(request)) as { action?: string; target?: string; reason?: string } | null;
  if (body?.action !== "kick" && body?.action !== "ban" && body?.action !== "pardon") return apiError("validation", 400);
  if (!body.target) return apiError("validation", 400);
  try {
    const result = await playerAction(server, body.action, body.target, body.reason ?? "");
    if (!result.ok) return apiError(result.error, result.error === "validation" ? 400 : 409);
    logEvent(auth.user, `player.${body.action}`, { name: server.name, target: body.target });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "request_failed";
    return apiError(code, 502);
  }
}
