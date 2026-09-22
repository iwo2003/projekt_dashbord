import { apiError, guard } from "@/lib/api";
import { deleteMysqlDatabaseRow, getMysqlDatabase, logEvent } from "@/lib/db";
import { dropMysqlDatabase } from "@/lib/mysql";

export const runtime = "nodejs";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, ctx: Ctx) {
  const auth = await guard("databases.manage");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const database = getMysqlDatabase(id);
  if (!database) return apiError("not_found", 404);
  const dropped = await dropMysqlDatabase(database.name);
  if (!dropped.ok) {
    const status = dropped.error === "docker_offline" || dropped.error === "mysql_timeout" ? 503 : 502;
    return apiError(dropped.error, status);
  }
  deleteMysqlDatabaseRow(id);
  logEvent(auth.user, "database.delete", { name: database.name });
  return Response.json({ ok: true });
}
