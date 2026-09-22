import { apiError, guard, readJson } from "@/lib/api";
import { backupsFor, createBackup } from "@/lib/backups";
import { getServer } from "@/lib/db";
import { backupCreateSchema } from "@/lib/schemas";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const auth = await guard("servers.backups");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  if (!getServer(id)) return apiError("not_found", 404);
  return Response.json({ backups: backupsFor(id) });
}

export async function POST(request: Request, ctx: Ctx) {
  const auth = await guard("servers.backups");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const server = getServer(id);
  if (!server) return apiError("not_found", 404);
  const parsed = backupCreateSchema.safeParse((await readJson(request)) ?? {});
  if (!parsed.success) return apiError("validation", 400);
  try {
    const backup = await createBackup(auth.user, server, Boolean(parsed.data.safe));
    return Response.json({ backup });
  } catch (error) {
    console.error(error);
    return apiError("backup_failed", 500);
  }
}
