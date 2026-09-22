import Docker from "dockerode";
import fs from "fs/promises";
import path from "path";
import { CS2_MODES, IMAGES } from "./constants";
import type { Game, ServerConfig, ServerRecord } from "./types";

let client: Docker | null = null;

export function getDocker() {
  if (!client) {
    client =
      process.platform === "win32"
        ? new Docker({ socketPath: "//./pipe/docker_engine" })
        : new Docker({ socketPath: process.env.DOCKER_SOCKET || "/var/run/docker.sock" });
  }
  return client;
}

export async function dockerPing() {
  try {
    await getDocker().ping();
    return { ok: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "docker_offline";
    return { ok: false as const, message };
  }
}

export function decodeDockerChunk(chunk: Buffer) {
  if (chunk.length >= 8) {
    const size = chunk.readUInt32BE(4);
    if (size <= chunk.length - 8 && chunk[1] === 0 && chunk[2] === 0 && chunk[3] === 0) {
      let text = "";
      let offset = 0;
      while (offset + 8 <= chunk.length) {
        const length = chunk.readUInt32BE(offset + 4);
        if (length < 0 || offset + 8 + length > chunk.length) break;
        text += chunk.subarray(offset + 8, offset + 8 + length).toString("utf8");
        offset += 8 + length;
      }
      if (text) return text;
    }
  }
  return chunk.toString("utf8");
}

export async function pullImage(image: string) {
  const docker = getDocker();
  const stream = await docker.pull(image);
  const modem = docker.modem as unknown as {
    followProgress: (source: NodeJS.ReadableStream, done: (err: Error | null) => void) => void;
  };
  await new Promise<void>((resolve, reject) => {
    modem.followProgress(stream, (error) => (error ? reject(error) : resolve()));
  });
}

async function imageExists(image: string) {
  try {
    await getDocker().getImage(image).inspect();
    return true;
  } catch {
    return false;
  }
}

export async function ensureImage(image: string) {
  if (!(await imageExists(image))) await pullImage(image);
}

function bindPath(volume: string, target: string) {
  return `${volume.replace(/\\/g, "/")}:${target}`;
}

function memoryBytes(gb: number) {
  return Math.max(1, gb) * 1024 * 1024 * 1024;
}

function containerMemoryBytes(server: ServerRecord) {
  const heap = memoryBytes(server.config.memoryGb);
  if (server.game !== "minecraft") return heap;
  return heap + 512 * 1024 * 1024;
}

function sameImage(current: string, desired: string) {
  return current.replace(/^docker.io\//, "") === desired.replace(/^docker.io\//, "");
}

function minecraftEnv(name: string, port: number, config: ServerConfig, hostNetwork: boolean) {
  const env = [
    "EULA=TRUE",
    `TYPE=${config.mcType ?? "PAPER"}`,
    `VERSION=${config.version ?? "LATEST"}`,
    `MEMORY=${config.memoryGb}G`,
    `MAX_PLAYERS=${config.maxPlayers}`,
    `MOTD=${(config.motd || name).replace(/[\r\n]/g, " ")}`,
    `MODE=${config.gameMode ?? "survival"}`,
    `DIFFICULTY=${config.difficulty ?? "normal"}`,
    `VIEW_DISTANCE=${config.viewDistance ?? 10}`,
    `ONLINE_MODE=${config.onlineMode === false ? "FALSE" : "TRUE"}`,
    "ENABLE_RCON=true",
    `RCON_PASSWORD=${config.rconPassword}`,
    "OVERRIDE_SERVER_PROPERTIES=true",
    "USE_AIKAR_FLAGS=true",
    `TZ=${Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Warsaw"}`,
  ];
  if (hostNetwork) {
    const rconPort = port + 10000 <= 65535 ? port + 10000 : port - 1;
    env.push(`SERVER_PORT=${port}`, `RCON_PORT=${rconPort}`);
  } else {
    env.push("SERVER_PORT=25565");
  }
  if (process.platform !== "win32" && typeof process.getuid === "function") {
    const uid = process.getuid();
    const gid = typeof process.getgid === "function" ? process.getgid() : uid;
    if (uid > 0) env.push(`UID=${uid}`, `GID=${gid}`);
  }
  return env;
}

function cs2Env(name: string, port: number, config: ServerConfig) {
  const mode = CS2_MODES[config.cs2Mode ?? "competitive"];
  const env = [
    `SRCDS_TOKEN=${(config.gslt ?? "").trim()}`,
    `CS2_SERVERNAME=${name.replace(/[\\/]/g, "-")}`,
    `CS2_PORT=${port}`,
    `CS2_RCONPW=${config.rconPassword}`,
    `CS2_MAXPLAYERS=${config.maxPlayers}`,
    `CS2_STARTMAP=${config.map ?? "de_dust2"}`,
    `CS2_GAMETYPE=${mode.type}`,
    `CS2_GAMEMODE=${mode.mode}`,
    "CS2_SERVER_HIBERNATE=0",
    "CS2_LAN=0",
    "STEAMAPPVALIDATE=0",
  ];
  if (config.password) env.push(`CS2_PW=${config.password.replace(/[\r\n]/g, "")}`);
  return env;
}

export async function createGameContainer(server: ServerRecord) {
  await fs.mkdir(server.volumePath, { recursive: true });
  await fs.chmod(server.volumePath, 0o777).catch(() => undefined);
  const docker = getDocker();
  const name = `helios-${server.id}`;
  try {
    await docker.getContainer(name).remove({ force: true });
  } catch {
    /* no previous container */
  }

  const minecraft = server.game === "minecraft";
  const image = imageFor(server.game, server.config.version);
  await ensureImage(image);
  const hostNetwork = minecraft && process.platform !== "win32";
  const internalGamePort = minecraft ? 25565 : 27015;
  const exposed: Record<string, Record<string, never>> = {
    [`${internalGamePort}/tcp`]: {},
  };
  const bindings: Record<string, { HostPort: string }[]> = {
    [`${internalGamePort}/tcp`]: [{ HostPort: String(server.port) }],
  };
  if (!minecraft) {
    exposed[`${internalGamePort}/udp`] = {};
    exposed["27020/udp"] = {};
    bindings[`${internalGamePort}/udp`] = [{ HostPort: String(server.port) }];
    bindings["27020/udp"] = [{ HostPort: String(server.extraPort ?? server.port + 5) }];
  }

  const container = await docker.createContainer({
    name,
    Image: image,
    Env: minecraft
      ? minecraftEnv(server.name, server.port, server.config, hostNetwork)
      : cs2Env(server.name, internalGamePort, server.config),
    Tty: true,
    OpenStdin: true,
    ExposedPorts: hostNetwork ? undefined : exposed,
    HostConfig: {
      NetworkMode: hostNetwork ? "host" : "bridge",
      PortBindings: hostNetwork ? undefined : bindings,
      Binds: [bindPath(server.volumePath, minecraft ? "/data" : "/home/steam/cs2-dedicated")],
      Memory: containerMemoryBytes(server),
      MemorySwap: containerMemoryBytes(server),
      RestartPolicy: { Name: "unless-stopped" },
    },
  });
  return container.id;
}

export async function startContainer(containerId: string) {
  await getDocker().getContainer(containerId).start();
}

export async function stopContainer(containerId: string) {
  try {
    await getDocker().getContainer(containerId).stop();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!/not running|already stopped|304/i.test(message)) throw error;
  }
}

export async function restartContainer(containerId: string) {
  await getDocker().getContainer(containerId).restart();
}

export async function removeContainer(containerId: string) {
  try {
    await getDocker().getContainer(containerId).remove({ force: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!/no such container|404/i.test(message)) throw error;
  }
}

export async function removeGameContainer(serverId: string, containerId?: string | null) {
  const docker = getDocker();
  const name = `helios-${serverId}`;
  const targets = new Set<string>();
  if (containerId) targets.add(containerId);
  targets.add(name);
  try {
    const listed = await docker.listContainers({ all: true });
    for (const item of listed) {
      if (item.Names?.some((entry) => entry === `/${name}`)) targets.add(item.Id);
    }
  } catch {
    /* name and stored id are still removed below */
  }
  for (const target of targets) {
    await removeContainer(target);
  }
}

export async function publishedPorts() {
  const used = new Set<number>();
  try {
    const listed = await getDocker().listContainers({ all: true });
    for (const item of listed) {
      for (const entry of item.Ports ?? []) {
        if (entry.PublicPort) used.add(entry.PublicPort);
      }
    }
  } catch {
    /* docker is offline; the database ports still count */
  }
  return used;
}

export async function inspectState(containerId: string) {
  try {
    const info = await getDocker().getContainer(containerId).inspect();
    return {
      running: Boolean(info.State.Running),
      restarting: Boolean(info.State.Restarting),
      restartCount: info.RestartCount ?? 0,
      error: info.State.Error || "",
    };
  } catch {
    return null;
  }
}
export async function inspectRunning(containerId: string) {
  const state = await inspectState(containerId);
  if (!state) return null;
  return state.running;
}

export function followLogs(containerId: string) {
  return getDocker().getContainer(containerId).logs({
    follow: true,
    stdout: true,
    stderr: true,
    tail: 300,
    timestamps: false,
  });
}

export function readLogs(containerId: string) {
  return getDocker().getContainer(containerId).logs({
    stdout: true,
    stderr: true,
    tail: 300,
    timestamps: false,
  });
}

export async function execCommand(containerId: string, command: string[]) {
  const exec = await getDocker().getContainer(containerId).exec({
    Cmd: command,
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
  return decodeDockerChunk(Buffer.concat(chunks)).trim();
}

export function volumeFor(id: string) {
  return path.join(process.cwd(), "data", "servers", id);
}

export function minecraftImage(version?: string) {
  const value = version && version !== "LATEST" ? version : "LATEST";
  if (value === "LATEST" || /^\d{2}\./.test(value)) return IMAGES.minecraftJava25;
  const match = /^1\.(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return IMAGES.minecraftJava25;
  const minor = Number(match[1]);
  const patch = Number(match[2] ?? 0);
  if (minor > 20 || (minor === 20 && patch >= 5)) return IMAGES.minecraftJava21;
  if (minor >= 17) return IMAGES.minecraftJava17;
  return IMAGES.minecraftJava21;
}

export function imageFor(game: Game, version?: string) {
  return game === "minecraft" ? minecraftImage(version) : IMAGES.cs2;
}

export async function containerImageMatches(server: ServerRecord) {
  if (!server.containerId) return false;
  try {
    const info = await getDocker().getContainer(server.containerId).inspect();
    if (!sameImage(info.Config?.Image ?? "", imageFor(server.game, server.config.version))) return false;
    if (server.game === "minecraft" && process.platform !== "win32") {
      return info.HostConfig?.NetworkMode === "host";
    }
    return true;
  } catch {
    return false;
  }
}
