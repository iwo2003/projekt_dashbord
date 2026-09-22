import { NextResponse } from "next/server";
import { apiError, guard } from "@/lib/api";
import { botLogs } from "@/lib/bots";
import { getBotRow } from "@/lib/db";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const auth = await guard("bots.view");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  if (!getBotRow(id)) return apiError("not_found", 404);
  return NextResponse.json(await botLogs(id));
}
