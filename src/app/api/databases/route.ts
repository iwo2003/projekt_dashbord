import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { apiError, guard, readJson } from "@/lib/api";
import { insertMysqlDatabase, listMysqlDatabases, logEvent, mysqlNameTaken } from "@/lib/db";
import { hostAddress } from "@/lib/metrics";
import { MYSQL_PORT, createMysqlDatabase, dropMysqlDatabase, mysqlOverview, validDatabaseName } from "@/lib/mysql";
import { databaseCreateSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const maxDuration = 300;

function failureStatus(error: string) {
  if (error === "docker_offline" || error === "mysql_timeout") return 503;
  if (error === "port_taken" || error === "name_taken") return 409;
  if (error === "validation") return 400;
  return 502;
}

export async function GET() {
  const auth = await guard("databases.view");
  if (auth.error) return auth.error;
  const status = await mysqlOverview();
  return NextResponse.json({
    databases: listMysqlDatabases(),
    host: hostAddress(),
    port: MYSQL_PORT,
    docker: status.docker,
    running: status.running,
  });
}

export async function POST(request: Request) {
  const auth = await guard("databases.manage");
  if (auth.error) return auth.error;
  const parsed = databaseCreateSchema.safeParse(await readJson(request));
  if (!parsed.success || !validDatabaseName(parsed.data.name)) return apiError("validation", 400);
  const name = parsed.data.name;
  if (mysqlNameTaken(name)) return apiError("name_taken", 409);
  const created = await createMysqlDatabase(name);
  if (!created.ok) return apiError(created.error, failureStatus(created.error));
  const database = {
    id: randomUUID(),
    name,
    username: name,
    password: created.password,
    createdBy: auth.user.username,
    createdAt: Date.now(),
  };
  try {
    insertMysqlDatabase(database);
  } catch {
    await dropMysqlDatabase(name);
    return apiError("name_taken", 409);
  }
  logEvent(auth.user, "database.create", { name });
  return NextResponse.json({ database });
}
