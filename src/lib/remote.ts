import { randomBytes } from "crypto";
import fs from "fs/promises";
import path from "path";
import { deleteFileLogin, getFileLogin, listFileLogins, upsertFileLogin, type FileLogin } from "./db";
import { dockerPing, ensureImage, getDocker, inspectRunning } from "./docker";
import { hostAddress } from "./metrics";

export const SFTP_PORT = 2222;
export const FTP_PORT = 21;
export const FTP_PASSIVE_START = 21000;
export const FTP_PASSIVE_END = 21010;
export const SFTP_DIR = "/files";

const SFTP_IMAGE = "atmoz/sftp:latest";
const FTP_IMAGE = "delfer/alpine-ftp-server";
const SFTP_NAME = "helios-sftp";
const FTP_NAME = "helios-ftp";

let chain: Promise<void> = Promise.resolve();

function remotePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  return [...randomBytes(16)].map((byte) => alphabet[byte % alphabet.length]).join("");
}

function remoteUsername(serverId: string) {
  return `h${serverId.replace(/-/g, "").toLowerCase().slice(0, 20)}`;
}

function bind(hostPath: string, target: string) {
  return `${hostPath.replace(/\\/g, "/")}:${target}`;
}

function usersFile() {
  return path.join(process.cwd(), "data", "sftp", "users.conf");
}

async function removeNamed(name: string) {
  try {
    await getDocker().getContainer(name).remove({ force: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!/no such container|404/i.test(message)) throw error;
  }
}

function ftpPortBindings() {
  const exposed: Record<string, Record<string, never>> = { "21/tcp": {} };
  const bindings: Record<string, { HostPort: string }[]> = {
    "21/tcp": [{ HostPort: String(FTP_PORT) }],
  };
  for (let port = FTP_PASSIVE_START; port <= FTP_PASSIVE_END; port += 1) {
    exposed[`${port}/tcp`] = {};
    bindings[`${port}/tcp`] = [{ HostPort: String(port) }];
  }
  return { exposed, bindings };
}

function portTakenMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return /already allocated|address already in use/i.test(message);
}

async function syncNow(): Promise<{ ok: true } | { ok: false; error: "docker_offline" | "port_taken" | "remote_failed" }> {
  const ping = await dockerPing();
  if (!ping.ok) return { ok: false, error: "docker_offline" };
  const logins = listFileLogins();
  try {
    await removeNamed(SFTP_NAME);
    await removeNamed(FTP_NAME);
  } catch {
    return { ok: false, error: "remote_failed" };
  }
  if (logins.length === 0) return { ok: true };

  const file = usersFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const lines = logins.map((login) => `${login.username}:${login.password}:1000:1000:files`);
  await fs.writeFile(file, `${lines.join("\n")}\n`, { mode: 0o600 });
  for (const login of logins) {
    await fs.mkdir(login.volumePath, { recursive: true });
    await fs.chmod(login.volumePath, 0o777).catch(() => undefined);
  }

  try {
    await ensureImage(SFTP_IMAGE);
    await ensureImage(FTP_IMAGE);
    const sftp = await getDocker().createContainer({
      name: SFTP_NAME,
      Image: SFTP_IMAGE,
      ExposedPorts: { "22/tcp": {} },
      HostConfig: {
        PortBindings: { "22/tcp": [{ HostPort: String(SFTP_PORT) }] },
        Binds: [
          `${bind(file, "/etc/sftp/users.conf")}:ro`,
          ...logins.map((login) => bind(login.volumePath, `/home/${login.username}/files`)),
        ],
        RestartPolicy: { Name: "unless-stopped" },
      },
    });
    await sftp.start();
    const ftpPorts = ftpPortBindings();
    const users = logins
      .map((login) => `${login.username}|${login.password}|/home/${login.username}|1000|1000`)
      .join(" ");
    const ftp = await getDocker().createContainer({
      name: FTP_NAME,
      Image: FTP_IMAGE,
      Env: [`USERS=${users}`, `ADDRESS=${hostAddress()}`, "MIN_PORT=21000", "MAX_PORT=21010"],
      ExposedPorts: ftpPorts.exposed,
      HostConfig: {
        PortBindings: ftpPorts.bindings,
        Binds: logins.map((login) => bind(login.volumePath, `/home/${login.username}`)),
        RestartPolicy: { Name: "unless-stopped" },
      },
    });
    await ftp.start();
  } catch (error) {
    if (portTakenMessage(error)) return { ok: false, error: "port_taken" };
    return { ok: false, error: "remote_failed" };
  }
  return { ok: true };
}

function syncRemote() {
  const run = chain.then(() => syncNow(), () => syncNow());
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function remoteOverview() {
  const ping = await dockerPing();
  if (!ping.ok) return { docker: false, sftp: false, ftp: false };
  const [sftp, ftp] = await Promise.all([inspectRunning(SFTP_NAME), inspectRunning(FTP_NAME)]);
  return { docker: true, sftp: sftp === true, ftp: ftp === true };
}

export function publicLogin(login: FileLogin | undefined) {
  if (!login) return null;
  return { username: login.username, password: login.password, createdAt: login.createdAt };
}

export async function remoteCard(targetId: string) {
  const status = await remoteOverview();
  return {
    login: publicLogin(getFileLogin(targetId)),
    host: hostAddress(),
    sftpPort: SFTP_PORT,
    ftpPort: FTP_PORT,
    sftpPath: SFTP_DIR,
    ftpPath: "/",
    passiveFrom: FTP_PASSIVE_START,
    passiveTo: FTP_PASSIVE_END,
    docker: status.docker,
    sftp: status.sftp,
    ftp: status.ftp,
  };
}

export function remoteFailureStatus(error: string) {
  if (error === "docker_offline") return 503;
  if (error === "port_taken") return 409;
  return 502;
}

export async function enableRemote(targetId: string, reset: boolean) {
  const existing = getFileLogin(targetId);
  const password = !existing || reset ? remotePassword() : existing.password;
  upsertFileLogin({
    serverId: targetId,
    username: existing?.username ?? remoteUsername(targetId),
    password,
    createdAt: existing?.createdAt ?? Date.now(),
  });
  const synced = await syncRemote();
  if (!synced.ok) {
    if (!existing) deleteFileLogin(targetId);
    else if (reset) {
      upsertFileLogin({
        serverId: existing.serverId,
        username: existing.username,
        password: existing.password,
        createdAt: existing.createdAt,
      });
    }
    return synced;
  }
  return { ok: true as const, login: publicLogin(getFileLogin(targetId)) };
}

export async function disableRemote(serverId: string) {
  const existing = getFileLogin(serverId);
  deleteFileLogin(serverId);
  if (!existing) return { ok: true as const };
  return syncRemote();
}
