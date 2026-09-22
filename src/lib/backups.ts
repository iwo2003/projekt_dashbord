import { execFile } from "child_process";
import fs from "fs/promises";
import path from "path";
import { promisify } from "util";
import { randomUUID } from "crypto";
import { deleteBackupRow, getBackup, insertBackup, listBackups, logEvent } from "./db";
import { startContainer, stopContainer } from "./docker";
import type { PublicUser, ServerRecord } from "./types";

const exec = promisify(execFile);

function backupDir(serverId: string) {
  return path.join(process.cwd(), "data", "backups", serverId);
}

function backupFile(serverId: string, filename: string) {
  if (path.basename(filename) !== filename) throw new Error("path_escape");
  return path.join(backupDir(serverId), filename);
}

export async function createBackup(user: PublicUser, server: ServerRecord, safe: boolean) {
  await fs.mkdir(server.volumePath, { recursive: true });
  await fs.mkdir(backupDir(server.id), { recursive: true });
  const wasRunning = server.status === "running" && Boolean(server.containerId);
  if (safe && wasRunning && server.containerId) await stopContainer(server.containerId);
  const id = randomUUID();
  const filename = `${id}.tar.gz`;
  const destination = backupFile(server.id, filename);
  try {
    await exec("tar", ["-czf", destination, "-C", server.volumePath, "."], {
      windowsHide: true,
      timeout: 20 * 60 * 1000,
    });
    const stat = await fs.stat(destination);
    const backup = {
      id,
      serverId: server.id,
      filename,
      bytes: stat.size,
      createdBy: user.username,
      createdAt: Date.now(),
    };
    insertBackup(backup);
    logEvent(user, "server.backup", { name: server.name });
    return backup;
  } finally {
    if (safe && wasRunning && server.containerId) {
      await startContainer(server.containerId).catch((error) => console.error(error));
    }
  }
}

export function backupsFor(serverId: string) {
  return listBackups(serverId);
}

export function backupPath(serverId: string, backupId: string) {
  const backup = getBackup(backupId);
  if (!backup || backup.serverId !== serverId) return null;
  return { backup, file: backupFile(serverId, backup.filename) };
}

export async function restoreBackup(user: PublicUser, server: ServerRecord, backupId: string) {
  const located = backupPath(server.id, backupId);
  if (!located) return { ok: false as const, error: "not_found" as const };
  const wasRunning = server.status === "running" && Boolean(server.containerId);
  if (wasRunning && server.containerId) await stopContainer(server.containerId);
  await fs.mkdir(server.volumePath, { recursive: true });
  await exec("tar", ["-xzf", located.file, "-C", server.volumePath], {
    windowsHide: true,
    timeout: 20 * 60 * 1000,
  });
  if (wasRunning && server.containerId) await startContainer(server.containerId);
  logEvent(user, "server.restore", { name: server.name });
  return { ok: true as const, restored: true };
}

export async function removeBackup(serverId: string, backupId: string) {
  const located = backupPath(serverId, backupId);
  if (!located) return false;
  await fs.rm(located.file, { force: true });
  deleteBackupRow(backupId);
  return true;
}
