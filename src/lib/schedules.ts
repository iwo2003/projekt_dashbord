import { createBackup } from "./backups";
import { getSchedule, getServer, listSchedules, saveSchedule, type ServerSchedule } from "./db";
import { powerServer } from "./servers";
import type { PublicUser } from "./types";

const systemUser = {
  id: "system",
  username: "helios",
  isOwner: true,
  role: "owner",
  permissions: [] as string[],
  totpEnabled: false,
  backupCodesLeft: 0,
  createdAt: 0,
  lastLoginAt: null,
} satisfies PublicUser;

function stamp(date = new Date()) {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const day = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  return { clock: `${hours}:${minutes}`, day };
}

export function readSchedule(serverId: string) {
  return getSchedule(serverId);
}

export function updateSchedule(
  serverId: string,
  input: Pick<ServerSchedule, "restartAt" | "backupAt" | "stopAt" | "startAt">,
) {
  const current = getSchedule(serverId);
  saveSchedule({ ...current, ...input, serverId });
  return getSchedule(serverId);
}

export async function runSchedules() {
  const { clock, day } = stamp();
  for (const schedule of listSchedules()) {
    const server = getServer(schedule.serverId);
    if (!server) continue;
    const next = { ...schedule };
    let changed = false;
    if (schedule.restartAt === clock && schedule.lastRestart !== day && server.containerId) {
      await powerServer(systemUser, server.id, "restart").catch(() => undefined);
      next.lastRestart = day;
      changed = true;
    }
    if (schedule.backupAt === clock && schedule.lastBackup !== day) {
      await createBackup(systemUser, getServer(server.id) ?? server, false).catch(() => undefined);
      next.lastBackup = day;
      changed = true;
    }
    if (schedule.stopAt === clock && schedule.lastStop !== day && server.status === "running") {
      await powerServer(systemUser, server.id, "stop").catch(() => undefined);
      next.lastStop = day;
      changed = true;
    }
    if (schedule.startAt === clock && schedule.lastStart !== day && server.status !== "running") {
      await powerServer(systemUser, server.id, "start").catch(() => undefined);
      next.lastStart = day;
      changed = true;
    }
    if (changed) saveSchedule(next);
  }
}
