import Docker from "dockerode";
import fs from "fs/promises";
import path from "path";
import { CS2_MODES, IMAGES, sidePort } from "./constants";
import { hostAddress } from "./metrics";
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

function minecraftEnv(name: string, port: number, config: ServerConfig, hostNetwork: boolean, update: boolean) {
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
  if (update) env.push("FORCE_REDOWNLOAD=TRUE");
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

function cs2Env(name: string, port: number, config: ServerConfig, update: boolean) {
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
    `STEAMAPPVALIDATE=${update ? "1" : "0"}`,
  ];
  if (config.password) env.push(`CS2_PW=${config.password.replace(/[\r\n]/g, "")}`);
  return env;
}

function gmodEnv(name: string, port: number, clientPort: number, config: ServerConfig) {
  return [
    `HOSTNAME=${name.replace(/[\r\n]/g, " ")}`,
    `GMODPORT=${port}`,
    `CLIENTPORT=${clientPort}`,
    `MAXPLAYERS=${config.maxPlayers}`,
    "GAMEMODE=sandbox",
    `GAMEMAP=${config.map || "gm_flatgrass"}`,
    `LOGINTOKEN=${(config.gslt ?? "").trim()}`,
    `RCONPASSWORD=${config.rconPassword}`,
  ];
}

function tf2Env(name: string, port: number, tvPort: number, config: ServerConfig) {
  const env = [
    `SRCDS_TOKEN=${(config.gslt ?? "").trim()}`,
    `SRCDS_HOSTNAME=${name.replace(/[\r\n]/g, " ")}`,
    `SRCDS_PORT=${port}`,
    `SRCDS_TV_PORT=${tvPort}`,
    `SRCDS_RCONPW=${config.rconPassword}`,
    `SRCDS_MAXPLAYERS=${config.maxPlayers}`,
    `SRCDS_STARTMAP=${config.map || "ctf_2fort"}`,
  ];
  if (config.password) env.push(`SRCDS_PW=${config.password.replace(/[\r\n]/g, "")}`);
  return env;
}

function fs25Env(name: string, port: number, config: ServerConfig) {
  return [
    `SERVER_NAME=${name.replace(/[\r\n]/g, " ")}`,
    `SERVER_PASSWORD=${(config.password ?? "").replace(/[\r\n]/g, "")}`,
    `SERVER_ADMIN=${config.rconPassword}`,
    `SERVER_PLAYERS=${config.maxPlayers}`,
    `SERVER_PORT=${port}`,
    `SERVER_MAP=${config.map || "MapUS"}`,
    "SERVER_CROSSPLAY=true",
    "AUTOSTART_SERVER=true",
    "WEB_USERNAME=admin",
    `WEB_PASSWORD=${config.rconPassword}`,
    `VNC_PASSWORD=${config.rconPassword}`,
    "PUID=0",
    "PGID=0",
  ];
}

function configPassword(server: ServerRecord) {
  return server.config.rconPassword;
}

async function prepareFs25(server: ServerRecord) {
  for (const folder of ["config", "game", "dlc", "installer"]) {
    const dir = path.join(server.volumePath, folder);
    await fs.mkdir(dir, { recursive: true });
    await fs.chmod(dir, 0o777).catch(() => undefined);
  }
  const web = sidePort("fs25", server.port);
  await fs.writeFile(
    path.join(server.volumePath, "installer", "CZYTAJ.txt"),
    "Wrzuć tutaj rozpakowane pliki Farming Simulator 25 z portalu GIANTS.\nSam serwer nie jest w Steam. Dodatki wrzuć do katalogu dlc, potem zrób restart.\n",
  );
  await fs.writeFile(
    path.join(server.volumePath, "panel.txt"),
    `Gra: ${hostAddress()}:${server.port}\nPanel WWW: http://${hostAddress()}:${web}\nLogin: admin\nHasło: ${configPassword(server)}\n`,
  );
}

function gtaEnv(config: ServerConfig) {
  const env = [`LICENSE_KEY=${(config.licenseKey ?? "").trim()}`, `RCON_PASSWORD=${config.rconPassword}`];
  if (config.onesync === false) env.push("NO_ONESYNC=1");
  return env;
}

function cfgText(value: string) {
  return value.replace(/[\r\n"]/g, " ").trim();
}

const GTA_RESOURCES = ["mapmanager", "chat", "spawnmanager", "sessionmanager", "basic-gamemode", "hardcap"];

async function prepareGta(server: ServerRecord) {
  const resources = path.join(server.volumePath, "resources");
  await fs.mkdir(resources, { recursive: true });
  await fs.chmod(resources, 0o777).catch(() => undefined);
  const port = server.port;
  const name = cfgText(server.name);
  const desc = cfgText(server.config.motd || server.name);
  const key = (server.config.licenseKey ?? "").trim();
  const cfgPath = path.join(server.volumePath, "server.cfg");
  const builtIn = new Set(GTA_RESOURCES);
  let extra: string[] = [];
  try {
    const existing = await fs.readFile(cfgPath, "utf8");
    extra = existing
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => {
        const match = /^ensure\s+(\S+)/.exec(line);
        return match != null && !builtIn.has(match[1]);
      });
  } catch {
    /* first start */
  }
  const lines = [
    `endpoint_add_tcp "0.0.0.0:${port}"`,
    `endpoint_add_udp "0.0.0.0:${port}"`,
    `sv_maxclients ${server.config.maxPlayers}`,
    `sv_hostname "${name}"`,
    `sets sv_projectName "${name}"`,
    `sets sv_projectDesc "${desc}"`,
    `sv_licenseKey "${key}"`,
    `set steam_webApiKey "none"`,
    "sv_scriptHookAllowed 0",
    `set onesync ${server.config.onesync === false ? "off" : "on"}`,
    `rcon_password "${server.config.rconPassword}"`,
    ...GTA_RESOURCES.map((item) => `ensure ${item}`),
    ...extra,
    "",
  ];
  await fs.writeFile(cfgPath, lines.join("\n"));
  await fs.writeFile(
    path.join(server.volumePath, "CZYTAJ.txt"),
    [
      "Serwer FiveM do GTA V.",
      "W FiveM naciśnij F8 i wpisz: connect ADRES:PORT",
      "Zasoby wrzuć do katalogu resources. W server.cfg dopisz linię: ensure nazwa",
      "Klucz z keymaster.fivem.net jest w server.cfg jako sv_licenseKey.",
      "",
      "FiveM server for GTA V.",
      "In FiveM press F8 and type: connect ADDRESS:PORT",
      "Put resources in the resources folder. Add this line to server.cfg: ensure name",
      "The key from keymaster.fivem.net is sv_licenseKey in server.cfg.",
      "",
    ].join("\n"),
  );
}

export async function createGameContainer(server: ServerRecord, update = false) {
  await fs.mkdir(server.volumePath, { recursive: true });
  await fs.chmod(server.volumePath, 0o777).catch(() => undefined);
  const docker = getDocker();
  const name = `helios-${server.id}`;
  try {
    await docker.getContainer(name).remove({ force: true });
  } catch {
    /* no previous container */
  }

  const image = imageFor(server.game, server.config.version);
  await ensureImage(image);
  const hostNetwork = server.game === "minecraft" && process.platform !== "win32";
  const exposed: Record<string, Record<string, never>> = {};
  const bindings: Record<string, { HostPort: string }[]> = {};
  function open(containerPort: number, proto: "tcp" | "udp", hostPort = containerPort) {
    const key = `${containerPort}/${proto}`;
    exposed[key] = {};
    bindings[key] = [{ HostPort: String(hostPort) }];
  }

  let env: string[];
  let volume = "/data";
  if (server.game === "minecraft") {
    env = minecraftEnv(server.name, server.port, server.config, hostNetwork, update);
    volume = "/data";
    if (!hostNetwork) open(25565, "tcp", server.port);
  } else if (server.game === "cs2") {
    env = cs2Env(server.name, 27015, server.config, update);
    volume = "/home/steam/cs2-dedicated";
    open(27015, "tcp", server.port);
    open(27015, "udp", server.port);
    open(27020, "udp", server.extraPort ?? server.port + 5);
  } else if (server.game === "gmod") {
    const client = server.extraPort ?? server.port + 1;
    env = gmodEnv(server.name, server.port, client, server.config);
    volume = "/home/steam/garrysmod";
    open(server.port, "tcp");
    open(server.port, "udp");
    open(client, "udp");
  } else if (server.game === "tf2") {
    const tv = server.extraPort ?? server.port + 5;
    env = tf2Env(server.name, server.port, tv, server.config);
    volume = "/home/steam/tf-dedicated";
    open(server.port, "tcp");
    open(server.port, "udp");
    open(tv, "udp");
  } else if (server.game === "gta") {
    await prepareGta(server);
    env = gtaEnv(server.config);
    volume = "/config";
    open(server.port, "tcp");
    open(server.port, "udp");
  } else {
    await prepareFs25(server);
    env = fs25Env(server.name, server.port, server.config);
    open(server.port, "tcp");
    open(server.port, "udp");
    if (server.extraPort) open(7999, "tcp", server.extraPort);
  }

  const binds =
    server.game === "fs25"
      ? ["config", "game", "dlc", "installer"].map((folder) =>
          bindPath(path.join(server.volumePath, folder), `/opt/fs25/${folder}`),
        )
      : [bindPath(server.volumePath, volume)];

  const container = await docker.createContainer({
    name,
    Image: image,
    Env: env,
    Tty: true,
    OpenStdin: true,
    ExposedPorts: hostNetwork ? undefined : exposed,
    HostConfig: {
      NetworkMode: hostNetwork ? "host" : "bridge",
      PortBindings: hostNetwork ? undefined : bindings,
      Binds: binds,
      Memory: containerMemoryBytes(server),
      MemorySwap: containerMemoryBytes(server),
      RestartPolicy: { Name: "unless-stopped" },
      ...(server.game === "fs25" ? { CapAdd: ["SYS_NICE"] } : {}),
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
  if (game === "minecraft") return minecraftImage(version);
  if (game === "gmod") return IMAGES.gmod;
  if (game === "fs25") return IMAGES.fs25;
  if (game === "tf2") return IMAGES.tf2;
  if (game === "gta") return IMAGES.gta;
  return IMAGES.cs2;
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
