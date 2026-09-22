import { apiError, guard } from "@/lib/api";
import { uploadBot } from "@/lib/bots";
import { getBotRow, logEvent } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await guard("bots.manage");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const bot = getBotRow(id);
  if (!bot) return apiError("not_found", 404);
  const form = await request.formData();
  const files = form.getAll("files").filter((item): item is File => item instanceof File);
  if (files.length === 0) return apiError("validation", 400);
  const payload = [];
  for (const file of files) payload.push({ name: file.name, data: Buffer.from(await file.arrayBuffer()) });
  const saved = await uploadBot(id, payload);
  if (!saved.ok) {
    const status = saved.error === "too_large" ? 413 : saved.error === "docker_offline" ? 503 : saved.error === "bot_failed" ? 502 : 400;
    return apiError(saved.error, status);
  }
  logEvent(auth.user, "bot.upload", { name: bot.name });
  return Response.json({ bot: saved.bot });
}
