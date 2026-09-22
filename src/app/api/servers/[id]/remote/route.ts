import { NextResponse } from "next/server";
import { apiError, guard, readJson } from "@/lib/api";
import { getServer, logEvent } from "@/lib/db";
import { disableRemote, enableRemote, remoteCard, remoteFailureStatus } from "@/lib/remote";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

const actionSchema = z.object({
  action: z.enum(["enable", "reset"]),
});

export async function GET(_request: Request, ctx: Ctx) {
  const auth = await guard("servers.files.write");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  if (!getServer(id)) return apiError("not_found", 404);
  return NextResponse.json(await remoteCard(id));
}

export async function POST(request: Request, ctx: Ctx) {
  const auth = await guard("servers.files.write");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const server = getServer(id);
  if (!server) return apiError("not_found", 404);
  const parsed = actionSchema.safeParse(await readJson(request));
  if (!parsed.success) return apiError("validation", 400);
  const result = await enableRemote(id, parsed.data.action === "reset");
  if (!result.ok) return apiError(result.error, remoteFailureStatus(result.error));
  logEvent(auth.user, parsed.data.action === "reset" ? "file.remote_reset" : "file.remote_on", { name: server.name });
  return NextResponse.json(await remoteCard(id));
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const auth = await guard("servers.files.write");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const server = getServer(id);
  if (!server) return apiError("not_found", 404);
  const result = await disableRemote(id);
  if (!result.ok) return apiError(result.error, remoteFailureStatus(result.error));
  logEvent(auth.user, "file.remote_off", { name: server.name });
  return NextResponse.json(await remoteCard(id));
}
