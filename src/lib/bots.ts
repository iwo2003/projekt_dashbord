import { execFile } from "child_process";
import { randomUUID } from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";
import { deleteBotRow, getBotRow, insertBot, listBotRows, updateBot, type BotRow } from "./db";
import { decodeDockerChunk, dockerPing, ensureImage, getDocker, inspectState, readLogs } from "./docker";
import { disableRemote } from "./remote";

const execFileAsync = promisify(execFile);
const IMAGE = "node:22-alpine";
const TOKEN = /^[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{20,}$/;

const RUNNER = `#!/bin/sh
cd /bot || exit 1
if [ -f package.json ]; then
  npm install --omit=dev || exit 1
  if node -e "const p=require('./package.json'); process.exit(p.scripts && p.scripts.start ? 0 : 1)"; then
    exec npm start
  fi
fi
if [ -f index.js ]; then
  exec node index.js
fi
echo "Wgraj bota: index.js albo package.json ze skryptem start."
exit 1
`;

function rootDir() {
  return path.join(process.cwd(), "data", "bots");
}

function botDir(id: string) {
  return path.join(rootDir(), id);
}

function containerName(id: string) {
  return `helios-bot-${id}`;
}

function present(bot: BotRow, running: boolean) {
  return {
    id: bot.id,
    name: bot.name,
    status: running ? "running" : bot.status === "error" ? "error" : "stopped",
    tokenSet: Boolean(bot.token),
    createdAt: bot.createdAt,
  };
}

async function refresh(bot: BotRow) {
  if (!bot.containerId) return present(bot, false);
  const state = await inspectState(bot.containerId);
  const running = Boolean(state?.running);
  const status = running ? "running" : "stopped";
  if (status !== bot.status) updateBot(bot.id, { status });
  return present({ ...bot, status }, running);
}

export async function botsOverview() {
  const bots = await Promise.all(listBotRows().map((bot) => refresh(bot)));
  return { bots };
}

export async function createBot(userId: string, name: string, token: string) {
  const trimmed = name.trim();
  const secret = token.trim().replace(/^Bot\s+/i, "");
  if (trimmed.length < 2 || trimmed.length > 40 || !TOKEN.test(secret)) {
    return { ok: false as const, error: "validation" as const };
  }
  const row: BotRow = {
    id: randomUUID(),
    name: trimmed,
    token: secret,
    containerId: null,
    status: "stopped",
    createdBy: userId,
    createdAt: Date.now(),
  };
  await fs.mkdir(botDir(row.id), { recursive: true });
  await fs.writeFile(path.join(botDir(row.id), ".env"), `DISCORD_TOKEN=${secret}\n`, { mode: 0o600 });
  await fs.writeFile(
    path.join(botDir(row.id), "index.js"),
    `console.log("Helios: wgraj pliki bota. Token jest w zmiennej DISCORD_TOKEN.");\n`,
  );
  insertBot(row);
  return { ok: true as const, bot: present(row, false) };
}

async function ensureContainer(bot: BotRow) {
  const dir = botDir(bot.id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(rootDir(), "runner.sh"), RUNNER);
  await fs.writeFile(path.join(dir, ".env"), `DISCORD_TOKEN=${bot.token}\n`, { mode: 0o600 });
  const name = containerName(bot.id);
  try {
    await getDocker().getContainer(name).remove({ force: true });
  } catch {
    /* first start */
  }
  await ensureImage(IMAGE);
  const created = await getDocker().createContainer({
    name,
    Image: IMAGE,
    Env: [`DISCORD_TOKEN=${bot.token}`],
    WorkingDir: "/bot",
    Cmd: ["sh", "/opt/helios-bot.sh"],
    HostConfig: {
      Binds: [
        `${dir.replace(/\\/g, "/")}:/bot`,
        `${path.join(rootDir(), "runner.sh").replace(/\\/g, "/")}:/opt/helios-bot.sh:ro`,
      ],
      RestartPolicy: { Name: "unless-stopped" },
    },
  });
  updateBot(bot.id, { containerId: created.id, status: "stopped" });
  return created;
}

export async function powerBot(id: string, action: "start" | "stop" | "restart") {
  const bot = getBotRow(id);
  if (!bot) return { ok: false as const, error: "not_found" as const };
  const ping = await dockerPing();
  if (!ping.ok) return { ok: false as const, error: "docker_offline" as const };
  try {
    if (action === "start" || action === "restart") {
      const created = await ensureContainer(bot);
      await created.start();
      updateBot(id, { status: "running" });
    } else if (!bot.containerId) {
      return { ok: false as const, error: "not_found" as const };
    } else {
      await getDocker().getContainer(bot.containerId).stop().catch(() => undefined);
      updateBot(id, { status: "stopped" });
    }
  } catch {
    updateBot(id, { status: "error" });
    return { ok: false as const, error: "bot_failed" as const };
  }
  const next = getBotRow(id);
  return { ok: true as const, bot: next ? await refresh(next) : present(bot, action !== "stop") };
}

export async function removeBot(id: string) {
  const bot = getBotRow(id);
  if (!bot) return { ok: false as const, error: "not_found" as const };
  try {
    await getDocker().getContainer(bot.containerId || containerName(id)).remove({ force: true });
  } catch {
    /* already gone */
  }
  await disableRemote(id);
  deleteBotRow(id);
  await fs.rm(botDir(id), { recursive: true, force: true });
  return { ok: true as const };
}

export async function uploadBot(id: string, files: { name: string; data: Buffer }[]) {
  const bot = getBotRow(id);
  if (!bot) return { ok: false as const, error: "not_found" as const };
  const dir = botDir(id);
  await fs.mkdir(dir, { recursive: true });
  for (const file of files) {
    if (file.data.length > 40 * 1024 * 1024) return { ok: false as const, error: "too_large" as const };
    if (file.name.toLowerCase().endsWith(".zip")) {
      const extracted = await extractZip(file.data, dir);
      if (!extracted.ok) return extracted;
      continue;
    }
    const base = path.basename(file.name).replace(/[\\/]/g, "");
    if (!/^[A-Za-z0-9._-]{1,120}$/.test(base)) return { ok: false as const, error: "validation" as const };
    await fs.writeFile(path.join(dir, base), file.data);
  }
  await flattenSingleFolder(dir);
  await fs.writeFile(path.join(dir, ".env"), `DISCORD_TOKEN=${bot.token}\n`, { mode: 0o600 });
  if (bot.status === "running") {
    const started = await powerBot(id, "restart");
    if (!started.ok) return started;
    return { ok: true as const, bot: started.bot };
  }
  return { ok: true as const, bot: await refresh(bot) };
}

export async function botLogs(id: string) {
  const bot = getBotRow(id);
  if (!bot?.containerId) return { ok: true as const, logs: "" };
  try {
    const logs = await readLogs(bot.containerId);
    const text = Buffer.isBuffer(logs) ? decodeDockerChunk(logs) : await collectStream(logs);
    return { ok: true as const, logs: text.split(bot.token).join("***") };
  } catch {
    return { ok: true as const, logs: "" };
  }
}

async function collectStream(logs: unknown) {
  if (!logs || typeof logs !== "object" || !("on" in logs)) return "";
  const stream = logs as NodeJS.ReadableStream;
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 2000);
    stream.on("data", (chunk: Buffer | string) => {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    });
    stream.on("end", () => {
      clearTimeout(timer);
      resolve();
    });
    stream.on("error", () => {
      clearTimeout(timer);
      resolve();
    });
  });
  return decodeDockerChunk(Buffer.concat(chunks));
}

async function extractZip(data: Buffer, dest: string) {
  const tmp = path.join(os.tmpdir(), `helios-bot-${randomUUID()}.zip`);
  await fs.writeFile(tmp, data);
  try {
    const { stdout } = await execFileAsync("tar", ["-tf", tmp], { timeout: 20000 });
    const names = stdout.split(/\r?\n/).filter(Boolean);
    if (names.length === 0 || names.length > 2000) return { ok: false as const, error: "site_archive" as const };
    for (const name of names) {
      const normalized = path.posix.normalize(name.replace(/\\/g, "/"));
      if (!normalized || normalized.startsWith("/") || normalized === ".." || normalized.startsWith("../") || normalized.includes("/../")) {
        return { ok: false as const, error: "path_escape" as const };
      }
    }
    await execFileAsync("tar", ["-xf", tmp, "-C", dest], { timeout: 30000 });
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "site_archive" as const };
  } finally {
    await fs.rm(tmp, { force: true });
  }
}

async function flattenSingleFolder(dest: string) {
  const hasEntry = async (name: string) => {
    try {
      await fs.access(path.join(dest, name));
      return true;
    } catch {
      return false;
    }
  };
  if ((await hasEntry("package.json")) || (await hasEntry("index.js"))) return;
  const entries = await fs.readdir(dest);
  const visible = entries.filter((name) => name !== ".env");
  if (visible.length !== 1) return;
  const only = path.join(dest, visible[0] ?? "");
  const stat = await fs.stat(only).catch(() => null);
  if (!stat?.isDirectory()) return;
  const nested = await fs.readdir(only);
  if (!nested.includes("package.json") && !nested.includes("index.js")) return;
  for (const name of nested) await fs.rename(path.join(only, name), path.join(dest, name));
  await fs.rmdir(only);
}
