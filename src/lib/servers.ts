import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { can } from "./permissions";
import { randomSecret } from "./crypto";
import {
  deleteServerRow,
  getServer,
  insertServer,
  listServers,
  logEvent,
  updateServer,
} from "./db";
import {
  createGameContainer,
  dockerPing,
  execCommand,
  imageFor,
  inspectRunning,
  containerImageMatches,
  ensureImage,
  publishedPorts,
  removeGameContainer,
  restartContainer,
  startContainer,
  stopContainer,
  volumeFor,
} from "./docker";
import { hostAddress } from "./metrics";
import { installCs2Plugins } from "./cs2-plugins";
import { disableRemote } from "./remote";
import { sourceRcon } from "./rcon";
import type { Game, PublicServer, PublicUser, ServerConfig, ServerRecord } from "./types";

const running = new Set<string>();
const cancelled = new Set<string>();

export function isProvisioning(id: string) {
  return running.has(id);
}

const RESERVED_PORTS = new Set([21, 22, 25, 80, 443, 465, 587, 993, 2222, 3000, 3306]);

export async function suggestPort(game: Game) {
  const used = new Set<number>(RESERVED_PORTS);
  for (const server of listServers()) {
    used.add(server.port);
    if (server.extraPort) used.add(server.extraPort);
  }
  for (const port of await publishedPorts()) used.add(port);
  let port = game === "minecraft" ? 25565 : 27015;
  const step = game === "cs2" ? 10 : 1;
  while (used.has(port) || (game === "cs2" && used.has(port + 5))) {
    port += step;
    if (port > 65000) break;
  }
  return port;
}

export function portTaken(port: number, extra: number | null, exceptId?: string) {
  return listServers().some((server) => {
    if (server.id === exceptId) return false;
    const ports = [server.port, server.extraPort].filter((value): value is number => value != null);
    if (ports.includes(port)) return true;
    if (extra != null && ports.includes(extra)) return true;
    return false;
  });
}

export function toPublicServer(server: ServerRecord, viewer: PublicUser): PublicServer {
  const { gslt, ...withSecret } = server.config;
  const rest = Object.fromEntries(
    Object.entries(withSecret).filter(([key]) => key !== "rconPassword"),
  ) as Omit<ServerConfig, "rconPassword" | "gslt">;
  return {
    id: server.id,
    name: server.name,
    game: server.game,
    status: server.status,
    statusDetail: server.statusDetail,
    error: server.error,
    port: server.port,
    extraPort: server.extraPort,
    connect: `${hostAddress()}:${server.port}`,
    hasContainer: Boolean(server.containerId),
    createdBy: server.createdBy,
    createdAt: server.createdAt,
    updatedAt: server.updatedAt,
    config: {
      ...rest,
      gsltSet: Boolean(gslt),
      ...(can(viewer, "servers.settings") ? { gslt: gslt ?? "" } : {}),
    },
  };
}

export async function syncServer(server: ServerRecord) {
  if (server.status === "provisioning" && running.has(server.id)) return server;
  if (server.status === "provisioning" && !running.has(server.id)) {
    return (
      updateServer(server.id, {
        status: "error",
        statusDetail: null,
        error: "provision_interrupted",
      }) ?? server
    );
  }
  if (!server.containerId) return server;
  const state = await inspectRunning(server.containerId);
  if (state === null) {
    if (server.status === "running") {
      return updateServer(server.id, { status: "stopped", statusDetail: null }) ?? server;
    }
    return server;
  }
  const status = state ? "running" : "stopped";
  if (status !== server.status) {
    return updateServer(server.id, { status, statusDetail: null, error: null }) ?? server;
  }
  return server;
}

function configFromInput(
  input: {
    maxPlayers: number;
    memoryGb: number;
    mcType?: ServerConfig["mcType"];
    version?: string;
    motd?: string;
    onlineMode?: boolean;
    difficulty?: ServerConfig["difficulty"];
    gameMode?: ServerConfig["gameMode"];
    viewDistance?: number;
    gslt?: string;
    map?: string;
    password?: string;
    cs2Mode?: ServerConfig["cs2Mode"];
  },
  previous?: ServerConfig,
): ServerConfig {
  return {
    maxPlayers: input.maxPlayers,
    memoryGb: input.memoryGb,
    rconPassword: previous?.rconPassword || randomSecret(18),
    mcType: input.mcType,
    version: input.version,
    motd: input.motd,
    onlineMode: input.onlineMode,
    difficulty: input.difficulty,
    gameMode: input.gameMode,
    viewDistance: input.viewDistance,
    gslt: input.gslt?.trim() || previous?.gslt,
    map: input.map,
    password: input.password,
    cs2Mode: input.cs2Mode,
  };
}

export async function beginCreate(
  user: PublicUser,
  input: {
    name: string;
    game: Game;
    port: number;
    maxPlayers: number;
    memoryGb: number;
    mcType?: ServerConfig["mcType"];
    version?: string;
    motd?: string;
    onlineMode?: boolean;
    difficulty?: ServerConfig["difficulty"];
    gameMode?: ServerConfig["gameMode"];
    viewDistance?: number;
    gslt?: string;
    map?: string;
    password?: string;
    cs2Mode?: ServerConfig["cs2Mode"];
  },
) {
  const ping = await dockerPing();
  if (!ping.ok) {
    console.error("Docker ping failed", ping.message);
    return { ok: false as const, error: "docker_offline" as const };
  }
  let port = input.port;
  let extraPort = input.game === "cs2" ? port + 5 : null;
  const published = await publishedPorts();
  const blocked =
    portTaken(port, extraPort) || published.has(port) || (extraPort != null && published.has(extraPort));
  if (blocked) {
    port = await suggestPort(input.game);
    extraPort = input.game === "cs2" ? port + 5 : null;
  }
  if (portTaken(port, extraPort)) return { ok: false as const, error: "port_taken" as const };
  const now = Date.now();
  const id = randomUUID();
  const server: ServerRecord = {
    id,
    name: input.name.trim(),
    game: input.game,
    status: "provisioning",
    statusDetail: "pulling",
    error: null,
    containerId: null,
    port,
    extraPort,
    volumePath: volumeFor(id),
    config: configFromInput(input),
    createdBy: user.username,
    createdAt: now,
    updatedAt: now,
  };
  insertServer(server);
  logEvent(user, "server.create", { name: server.name, game: server.game });
  enqueue(server.id, true);
  return { ok: true as const, server };
}

export function enqueue(id: string, start: boolean) {
  if (running.has(id)) return;
  running.add(id);
  void provision(id, start)
    .catch((error) => {
      const message = error instanceof Error ? error.message : "provision_failed";
      updateServer(id, { status: "error", statusDetail: null, error: message });
    })
    .finally(() => running.delete(id));
}

async function reuseOrRebuild(server: ServerRecord) {
  if (await containerImageMatches(server)) return server.containerId!;
  updateServer(server.id, { status: "provisioning", statusDetail: "pulling", error: null });
  const containerId = await createGameContainer(server);
  updateServer(server.id, { containerId, statusDetail: "starting" });
  return containerId;
}

async function provision(id: string, start: boolean) {
  const server = getServer(id);
  if (!server || cancelled.has(id)) return;
  updateServer(id, { status: "provisioning", statusDetail: "pulling", error: null });
  if (server.game === "cs2") {
    updateServer(id, { statusDetail: "plugins" });
    await installCs2Plugins(server.volumePath);
  }
  await ensureImage(imageFor(server.game, server.config.version));
  if (cancelled.has(id) || !getServer(id)) return;
  updateServer(id, { statusDetail: "creating" });
  const fresh = getServer(id);
  if (!fresh) return;
  const containerId = await createGameContainer(fresh);
  if (cancelled.has(id) || !getServer(id)) {
    await removeGameContainer(id, containerId);
    return;
  }
  updateServer(id, { containerId, statusDetail: start ? "starting" : null, status: start ? "provisioning" : "stopped" });
  if (start) {
    await startContainer(containerId);
    updateServer(id, { status: "running", statusDetail: null, error: null });
  }
}

export async function powerServer(user: PublicUser, id: string, action: "start" | "stop" | "restart") {
  const server = getServer(id);
  if (!server) return { ok: false as const, error: "not_found" as const };
  const ping = await dockerPing();
  if (!ping.ok) return { ok: false as const, error: "docker_offline" as const };
  if (action === "start") {
    if (!server.containerId) {
      enqueue(id, true);
      logEvent(user, "server.start", { name: server.name });
      return { ok: true as const, server: getServer(id)! };
    }
    if (server.game === "cs2") await installCs2Plugins(server.volumePath);
    const containerId = await reuseOrRebuild(server);
    await startContainer(containerId);
    const next = updateServer(id, { containerId, status: "running", statusDetail: null, error: null });
    logEvent(user, "server.start", { name: server.name });
    return { ok: true as const, server: next! };
  }
  if (!server.containerId) return { ok: false as const, error: "server_offline" as const };
  if (action === "stop") {
    await stopContainer(server.containerId);
    const next = updateServer(id, { status: "stopped", statusDetail: null });
    logEvent(user, "server.stop", { name: server.name });
    return { ok: true as const, server: next! };
  }
  if (server.game === "cs2") await installCs2Plugins(server.volumePath);
  const containerId = await reuseOrRebuild(server);
  await restartContainer(containerId);
  const next = updateServer(id, { containerId, status: "running", statusDetail: null, error: null });
  logEvent(user, "server.restart", { name: server.name });
  return { ok: true as const, server: next! };
}

export async function applySettings(
  user: PublicUser,
  id: string,
  input: {
    name: string;
    port: number;
    maxPlayers: number;
    memoryGb: number;
    mcType?: ServerConfig["mcType"];
    version?: string;
    motd?: string;
    onlineMode?: boolean;
    difficulty?: ServerConfig["difficulty"];
    gameMode?: ServerConfig["gameMode"];
    viewDistance?: number;
    gslt?: string;
    map?: string;
    password?: string;
    cs2Mode?: ServerConfig["cs2Mode"];
  },
) {
  const server = getServer(id);
  if (!server) return { ok: false as const, error: "not_found" as const };
  const extraPort = server.game === "cs2" ? input.port + 5 : null;
  if (portTaken(input.port, extraPort, id)) return { ok: false as const, error: "port_taken" as const };
  const nextConfig = configFromInput(input, server.config);
  if (server.game === "cs2" && !nextConfig.gslt) return { ok: false as const, error: "validation" as const };
  const wasRunning = server.status === "running";
  const structural =
    input.port !== server.port ||
    JSON.stringify({ ...server.config, rconPassword: "" }) !==
      JSON.stringify({ ...nextConfig, rconPassword: "" }) ||
    input.name !== server.name;
  updateServer(id, {
    name: input.name.trim(),
    port: input.port,
    extraPort,
    config: nextConfig,
  });
  if (structural && (server.containerId || server.status !== "error")) {
    const ping = await dockerPing();
    if (!ping.ok) return { ok: false as const, error: "docker_offline" as const };
    await removeGameContainer(id, server.containerId);
    updateServer(id, { containerId: null, status: "provisioning", statusDetail: "creating", error: null });
    enqueue(id, wasRunning);
  }
  logEvent(user, "server.update", { name: input.name.trim() });
  return { ok: true as const, server: getServer(id)! };
}

export async function destroyServer(user: PublicUser, id: string) {
  const server = getServer(id);
  if (!server) return { ok: false as const, error: "not_found" as const };
  cancelled.add(id);
  const ping = await dockerPing();
  if (!ping.ok) return { ok: false as const, error: "docker_offline" as const };
  await removeGameContainer(id, server.containerId);
  await fs.rm(server.volumePath, { recursive: true, force: true }).catch(() => undefined);
  await fs
    .rm(path.join(process.cwd(), "data", "backups", id), { recursive: true, force: true })
    .catch(() => undefined);
  await disableRemote(id);
  deleteServerRow(id);
  logEvent(user, "server.delete", { name: server.name });
  return { ok: true as const, server: null };
}

export async function sendCommand(server: ServerRecord, command: string) {
  if (server.status !== "running" || !server.containerId) {
    return { ok: false as const, error: "server_offline" as const };
  }
  if (server.game === "minecraft") {
    const output = await execCommand(server.containerId, ["rcon-cli", command]);
    return { ok: true as const, output };
  }
  const output = await sourceRcon(server.port, server.config.rconPassword, command);
  return { ok: true as const, output };
}
