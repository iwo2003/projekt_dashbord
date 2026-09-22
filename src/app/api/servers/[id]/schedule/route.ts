import { NextResponse } from "next/server";
import { apiError, guard, readJson } from "@/lib/api";
import { getServer, logEvent } from "@/lib/db";
import { readSchedule, updateSchedule } from "@/lib/schedules";

export const runtime = "nodejs";

const TIME = /^$|^([01]\d|2[0-3]):[0-5]\d$/;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const auth = await guard("servers.settings");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  if (!getServer(id)) return apiError("not_found", 404);
  return NextResponse.json({ schedule: readSchedule(id) });
}

export async function PUT(request: Request, ctx: Ctx) {
  const auth = await guard("servers.settings");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  if (!getServer(id)) return apiError("not_found", 404);
  const body = (await readJson(request)) as {
    restartAt?: string;
    backupAt?: string;
    stopAt?: string;
    startAt?: string;
  } | null;
  const restartAt = body?.restartAt ?? "";
  const backupAt = body?.backupAt ?? "";
  const stopAt = body?.stopAt ?? "";
  const startAt = body?.startAt ?? "";
  if (![restartAt, backupAt, stopAt, startAt].every((value) => TIME.test(value))) return apiError("validation", 400);
  const schedule = updateSchedule(id, { restartAt, backupAt, stopAt, startAt });
  logEvent(auth.user, "server.schedule", { name: getServer(id)?.name ?? id });
  return NextResponse.json({ schedule });
}
