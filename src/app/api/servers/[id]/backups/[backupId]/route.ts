import { createReadStream } from "fs";
import { Readable } from "stream";
import { apiError, guard } from "@/lib/api";
import { backupPath, removeBackup, restoreBackup } from "@/lib/backups";
import { getServer } from "@/lib/db";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; backupId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const auth = await guard("servers.backups");
  if (auth.error) return auth.error;
  const { id, backupId } = await ctx.params;
  const located = backupPath(id, backupId);
  if (!located) return apiError("not_found", 404);
  const stream = Readable.toWeb(createReadStream(located.file)) as ReadableStream;
  return new Response(stream, {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="${located.backup.filename}"`,
    },
  });
}

export async function POST(_request: Request, ctx: Ctx) {
  const auth = await guard("servers.backups");
  if (auth.error) return auth.error;
  const { id, backupId } = await ctx.params;
  const server = getServer(id);
  if (!server) return apiError("not_found", 404);
  try {
    const result = await restoreBackup(auth.user, server, backupId);
    if (!result.ok) return apiError(result.error, 404);
    return Response.json({ ok: true });
  } catch (error) {
    console.error(error);
    return apiError("backup_failed", 500);
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const auth = await guard("servers.backups");
  if (auth.error) return auth.error;
  const { id, backupId } = await ctx.params;
  const removed = await removeBackup(id, backupId);
  if (!removed) return apiError("not_found", 404);
  return Response.json({ ok: true });
}
