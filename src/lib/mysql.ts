import { randomBytes } from "crypto";
import fs from "fs/promises";
import path from "path";
import { decodeDockerChunk, dockerPing, ensureImage, getDocker } from "./docker";
import { listMysqlDatabases } from "./db";

export const MYSQL_PORT = 3306;
const MYSQL_CONTAINER = "helios-mysql";
const MYSQL_IMAGE = "mysql:8.4";
const RESERVED = new Set(["mysql", "information_schema", "performance_schema", "sys", "root"]);

const NAME_RE = /^[a-z][a-z0-9_]{1,31}$/;

type MysqlError = "docker_offline" | "port_taken" | "mysql_timeout" | "mysql_failed" | "name_taken";

export function validDatabaseName(name: string) {
  return NAME_RE.test(name) && !RESERVED.has(name);
}

function secretPath() {
  return path.join(process.cwd(), "data", "mysql-root.secret");
}

function volumePath() {
  return path.join(process.cwd(), "data", "mysql");
}

function mysqlPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(20);
  return `${[...bytes].map((byte) => alphabet[byte % alphabet.length]).join("")}!`;
}

async function rootPassword() {
  const file = secretPath();
  try {
    const existing = (await fs.readFile(file, "utf8")).trim();
    if (existing) return existing;
  } catch {
    /* first start */
  }
  const password = mysqlPassword() + mysqlPassword();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${password}\n`, { mode: 0o600 });
  return password;
}

async function inspectMysql() {
  try {
    return await getDocker().getContainer(MYSQL_CONTAINER).inspect();
  } catch {
    return null;
  }
}

async function runSql(rootPassword: string, sql: string) {
  const exec = await getDocker().getContainer(MYSQL_CONTAINER).exec({
    Cmd: ["mysql", "-uroot", `-p${rootPassword}`, "--batch", "--raw", "-e", sql],
    AttachStdout: true,
    AttachStderr: true,
  });
  const stream = await exec.start({ hijack: true, stdin: false });
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    stream.on("data", (chunk: Buffer | string) => {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    });
    stream.on("end", () => resolve());
    stream.on("error", reject);
  });
  const output = decodeDockerChunk(Buffer.concat(chunks)).trim();
  let exitCode: number | null = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    exitCode = (await exec.inspect()).ExitCode;
    if (exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (exitCode !== 0) throw new Error(output || "mysql_failed");
  return output;
}

async function waitUntilReady(password: string): Promise<{ ok: true } | { ok: false; error: MysqlError }> {
  let deniedStreak = 0;
  for (let attempt = 0; attempt < 45; attempt += 1) {
    try {
      await runSql(password, "SELECT 1");
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (/Access denied/i.test(message)) {
        deniedStreak += 1;
        if (deniedStreak >= 3) return { ok: false, error: "mysql_failed" };
      } else {
        deniedStreak = 0;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return { ok: false, error: deniedStreak > 0 ? "mysql_failed" : "mysql_timeout" };
}

async function removeMysql() {
  try {
    await getDocker().getContainer(MYSQL_CONTAINER).remove({ force: true });
  } catch {
    /* already gone */
  }
  await fs.rm(volumePath(), { recursive: true, force: true });
}

async function startMysql(password: string) {
  await ensureImage(MYSQL_IMAGE);
  const volume = volumePath();
  await fs.mkdir(volume, { recursive: true });
  const created = await getDocker().createContainer({
    name: MYSQL_CONTAINER,
    Image: MYSQL_IMAGE,
    Env: [
      `MYSQL_ROOT_PASSWORD=${password}`,
      "MYSQL_CHARACTER_SET_SERVER=utf8mb4",
      "MYSQL_COLLATION_SERVER=utf8mb4_unicode_ci",
    ],
    ExposedPorts: { "3306/tcp": {} },
    HostConfig: {
      PortBindings: { "3306/tcp": [{ HostPort: String(MYSQL_PORT) }] },
      Binds: [`${volume.replace(/\\/g, "/")}:/var/lib/mysql`],
      RestartPolicy: { Name: "unless-stopped" },
    },
  });
  await created.start();
}

async function ensureMysql(): Promise<{ ok: true; password: string } | { ok: false; error: MysqlError }> {
  const ping = await dockerPing();
  if (!ping.ok) return { ok: false, error: "docker_offline" };
  const password = await rootPassword();
  let info = await inspectMysql();
  if (!info) {
    try {
      await startMysql(password);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (/already allocated|address already in use/i.test(message)) return { ok: false, error: "port_taken" };
      info = await inspectMysql();
      if (!info) return { ok: false, error: "mysql_failed" };
    }
  }
  info = await inspectMysql();
  if (info && !info.State.Running) {
    try {
      await getDocker().getContainer(MYSQL_CONTAINER).start();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (/already allocated|address already in use/i.test(message)) return { ok: false, error: "port_taken" };
      return { ok: false, error: "mysql_failed" };
    }
  }
  let ready = await waitUntilReady(password);
  if (!ready.ok && ready.error === "mysql_failed" && listMysqlDatabases().length === 0) {
    await removeMysql();
    try {
      await startMysql(password);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (/already allocated|address already in use/i.test(message)) return { ok: false, error: "port_taken" };
      return { ok: false, error: "mysql_failed" };
    }
    ready = await waitUntilReady(password);
  }
  if (!ready.ok) return ready;
  return { ok: true, password };
}

async function statements(password: string, lines: string[]) {
  for (const line of lines) await runSql(password, line);
}

async function removeDatabase(password: string, name: string) {
  try {
    await statements(password, [
      `DROP DATABASE IF EXISTS \`${name}\``,
      `DROP USER IF EXISTS '${name}'@'%'`,
      "FLUSH PRIVILEGES",
    ]);
  } catch {
    /* leftover is cleaned on the next delete */
  }
}

export async function mysqlOverview() {
  const ping = await dockerPing();
  if (!ping.ok) return { docker: false, running: false };
  const info = await inspectMysql();
  return { docker: true, running: Boolean(info?.State.Running) };
}

export async function createMysqlDatabase(name: string) {
  if (!validDatabaseName(name)) return { ok: false as const, error: "validation" as const };
  const ready = await ensureMysql();
  if (!ready.ok) return ready;
  const password = mysqlPassword();
  try {
    await statements(ready.password, [
      `CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      `CREATE USER '${name}'@'%' IDENTIFIED BY '${password}'`,
      `GRANT ALL PRIVILEGES ON \`${name}\`.* TO '${name}'@'%'`,
      "FLUSH PRIVILEGES",
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    await removeDatabase(ready.password, name);
    if (/database exists|CREATE USER failed/i.test(message)) return { ok: false as const, error: "name_taken" as const };
    return { ok: false as const, error: "mysql_failed" as const };
  }
  return { ok: true as const, password };
}

export async function dropMysqlDatabase(name: string) {
  if (!validDatabaseName(name)) return { ok: false as const, error: "validation" as const };
  const ready = await ensureMysql();
  if (!ready.ok) return ready;
  try {
    await statements(ready.password, [
      `DROP DATABASE IF EXISTS \`${name}\``,
      `DROP USER IF EXISTS '${name}'@'%'`,
      "FLUSH PRIVILEGES",
    ]);
  } catch {
    return { ok: false as const, error: "mysql_failed" as const };
  }
  return { ok: true as const };
}
