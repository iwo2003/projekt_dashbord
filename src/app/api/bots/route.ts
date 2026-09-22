import { NextResponse } from "next/server";
import { apiError, guard, readJson } from "@/lib/api";
import { logEvent } from "@/lib/db";
import { botsOverview, createBot } from "@/lib/bots";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET() {
  const auth = await guard("bots.view");
  if (auth.error) return auth.error;
  return NextResponse.json(await botsOverview());
}

export async function POST(request: Request) {
  const auth = await guard("bots.manage");
  if (auth.error) return auth.error;
  const body = (await readJson(request)) as { name?: string; token?: string } | null;
  const created = await createBot(auth.user.id, body?.name ?? "", body?.token ?? "");
  if (!created.ok) return apiError(created.error, 400);
  logEvent(auth.user, "bot.create", { name: created.bot.name });
  return NextResponse.json({ bot: created.bot });
}
