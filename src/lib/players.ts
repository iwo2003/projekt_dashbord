import { sendCommand } from "./servers";
import type { ServerRecord } from "./types";

export type PlayerRow = { name: string; id: string; steam: string };

const MC_NAME = /^[A-Za-z0-9_]{1,16}$/;
const STEAM = /^(STEAM_[0-5]:[01]:\d+|\[[A-Za-z]:\d+:\d+\])$/;

function cleanReason(reason: string) {
  return reason.replace(/[\r\n"]/g, " ").trim().slice(0, 80);
}

function minecraftPlayers(list: string): PlayerRow[] {
  const match = /online:\s*([\s\S]*)$/i.exec(list);
  const body = match?.[1]?.trim() ?? "";
  if (!body || /^$/i.test(body)) return [];
  return body
    .split(",")
    .map((name) => name.trim())
    .filter((name) => MC_NAME.test(name))
    .map((name) => ({ name, id: name, steam: "" }));
}

function minecraftBans(text: string): PlayerRow[] {
  const names = new Set<string>();
  for (const line of text.split("\n")) {
    const match = /^([A-Za-z0-9_]{1,16})\s+was banned\b/i.exec(line.trim());
    if (match) names.add(match[1]);
  }
  return [...names].map((name) => ({ name, id: name, steam: "" }));
}

function cs2Players(status: string): PlayerRow[] {
  const rows: PlayerRow[] = [];
  for (const line of status.split("\n")) {
    const quoted = /#\s*(\d+)\s+\d+\s+"([^"]+)"\s+(\S+)/.exec(line);
    if (quoted) {
      rows.push({ name: quoted[2], id: quoted[1], steam: quoted[3] });
      continue;
    }
    const older = /#\s*(\d+)\s+"([^"]+)"\s+(STEAM_[0-5]:[01]:\d+|\[[^\]]+\])/.exec(line);
    if (older) {
      rows.push({ name: older[2], id: older[1], steam: older[3] });
      continue;
    }
    const plain = /#\s*\d+\s+(\d+)\s+(\S+)\s+(STEAM_[0-5]:[01]:\d+|\[[^\]]+\])/.exec(line);
    if (plain) rows.push({ name: plain[2], id: plain[1], steam: plain[3] });
  }
  return rows;
}

export async function playerSnapshot(server: ServerRecord) {
  if (server.game === "minecraft") {
    const online = await sendCommand(server, "list");
    const banned = await sendCommand(server, "banlist");
    if (!online.ok) return online;
    return {
      ok: true as const,
      online: minecraftPlayers(online.output),
      banned: banned.ok ? minecraftBans(banned.output) : [],
    };
  }
  const status = await sendCommand(server, "status");
  if (!status.ok) return status;
  return { ok: true as const, online: cs2Players(status.output), banned: [] as PlayerRow[] };
}

export async function playerAction(server: ServerRecord, action: "kick" | "ban" | "pardon", target: string, reason: string) {
  const why = cleanReason(reason);
  if (server.game === "minecraft") {
    if (!MC_NAME.test(target)) return { ok: false as const, error: "validation" as const };
    const command =
      action === "kick"
        ? `kick ${target}${why ? ` ${why}` : ""}`
        : action === "ban"
          ? `ban ${target}${why ? ` ${why}` : ""}`
          : `pardon ${target}`;
    return sendCommand(server, command);
  }
  if (action === "pardon") {
    if (!STEAM.test(target)) return { ok: false as const, error: "validation" as const };
    const removed = await sendCommand(server, `removeid ${target}`);
    if (!removed.ok) return removed;
    return sendCommand(server, "writeid");
  }
  if (action === "kick") {
    if (!/^\d{1,8}$/.test(target)) return { ok: false as const, error: "validation" as const };
    return sendCommand(server, `kickid ${target}${why ? ` ${why}` : ""}`);
  }
  if (!STEAM.test(target)) return { ok: false as const, error: "validation" as const };
  const banned = await sendCommand(server, `banid 0 ${target}`);
  if (!banned.ok) return banned;
  await sendCommand(server, "writeid");
  return { ok: true as const, output: banned.output };
}
