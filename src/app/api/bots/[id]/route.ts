import { apiError, guard, readJson } from "@/lib/api";
import { getBotRow, logEvent } from "@/lib/db";
import { powerBot, removeBot } from "@/lib/bots";

export const runtime = "nodejs";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await guard("bots.manage");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const bot = getBotRow(id);
  if (!bot) return apiError("not_found", 404);
  const body = (await readJson(request)) as { action?: string } | null;
  if (body?.action !== "start" && body?.action !== "stop" && body?.action !== "restart") return apiError("validation", 400);
  const result = await powerBot(id, body.action);
  if (!result.ok) {
    const status = result.error === "docker_offline" ? 503 : result.error === "bot_failed" ? 502 : 404;
    return apiError(result.error, status);
  }
  logEvent(auth.user, `bot.${body.action}`, { name: bot.name });
  return Response.json({ bot: result.bot });
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const auth = await guard("bots.manage");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const bot = getBotRow(id);
  if (!bot) return apiError("not_found", 404);
  const removed = await removeBot(id);
  if (!removed.ok) return apiError(removed.error, 404);
  logEvent(auth.user, "bot.delete", { name: bot.name });
  return Response.json({ ok: true });
}
