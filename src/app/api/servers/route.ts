import { apiError, guard, readJson } from "@/lib/api";
import { createServerSchema } from "@/lib/schemas";
import { beginCreate, suggestPort, syncServer, toPublicServer } from "@/lib/servers";
import { listServers } from "@/lib/db";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const auth = await guard("servers.view");
  if (auth.error) return auth.error;
  const servers = [];
  for (const server of listServers()) {
    servers.push(toPublicServer(await syncServer(server), auth.user));
  }
  return NextResponse.json({
    servers,
    suggested: {
      minecraft: await suggestPort("minecraft"),
      cs2: await suggestPort("cs2"),
    },
  });
}

export async function POST(request: Request) {
  const auth = await guard("servers.create");
  if (auth.error) return auth.error;
  const parsed = createServerSchema.safeParse(await readJson(request));
  if (!parsed.success) return apiError("validation", 400);
  const result = await beginCreate(auth.user, parsed.data);
  if (!result.ok) return apiError(result.error, result.error === "docker_offline" ? 503 : 409);
  return NextResponse.json({ server: toPublicServer(result.server, auth.user) });
}
