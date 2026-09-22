import fs from "fs/promises";
import path from "path";
import { decodeDockerChunk, dockerPing, ensureImage, getDocker } from "./docker";
import { getMailDomain, listMailboxes, setMailDomain } from "./db";

const MAIL_CONTAINER = "helios-mail";
const MAIL_IMAGE = "mailserver/docker-mailserver:latest";

export const MAIL_PORTS = { smtp: 25, submission: 587, smtps: 465, imap: 993 } as const;

type MailError = "docker_offline" | "port_taken" | "mail_timeout" | "mail_failed" | "domain_locked" | "validation";

const DOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

export function validMailDomain(domain: string) {
  return domain.length <= 253 && DOMAIN_RE.test(domain);
}

function configDir() {
  return path.join(process.cwd(), "data", "mail", "config");
}

function volumeDirs() {
  const root = path.join(process.cwd(), "data", "mail");
  return {
    config: path.join(root, "config"),
    data: path.join(root, "data"),
    state: path.join(root, "state"),
    logs: path.join(root, "logs"),
  };
}

function hostnameFor(domain: string) {
  return `mail.${domain}`;
}

async function inspectMail() {
  try {
    return await getDocker().getContainer(MAIL_CONTAINER).inspect();
  } catch {
    return null;
  }
}

function containerHostname(info: { Config: { Hostname?: string; Env?: string[] | null } }) {
  const override = info.Config.Env?.find((item) => item.startsWith("OVERRIDE_HOSTNAME="));
  if (override) return override.slice("OVERRIDE_HOSTNAME=".length);
  return info.Config.Hostname ?? "";
}

async function runSetup(args: string[]) {
  const exec = await getDocker().getContainer(MAIL_CONTAINER).exec({
    Cmd: ["setup", ...args],
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
  for (let attempt = 0; attempt < 40; attempt += 1) {
    exitCode = (await exec.inspect()).ExitCode;
    if (exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (exitCode !== 0) throw new Error(output || "mail_failed");
  return output;
}

async function waitUntilReady(): Promise<{ ok: true } | { ok: false; error: MailError }> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (containerCrashed(await inspectMail())) return { ok: false, error: "mail_failed" };
    try {
      await runSetup(["email", "list"]);
      return { ok: true };
    } catch {
      /* server is still booting */
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  return { ok: false, error: "mail_timeout" };
}

async function removeMail(wipe: boolean) {
  try {
    await getDocker().getContainer(MAIL_CONTAINER).remove({ force: true });
  } catch {
    /* already gone */
  }
  if (!wipe) return;
  await fs.rm(path.join(process.cwd(), "data", "mail"), { recursive: true, force: true });
}

async function waitForExit(container: { inspect: () => Promise<{ State: { Running: boolean; ExitCode: number } }>; remove: (opts: { force: boolean }) => Promise<unknown> }) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const info = await container.inspect();
    if (!info.State.Running) return info.State.ExitCode;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  await container.remove({ force: true });
  return 1;
}

async function ensureCertificates(hostname: string) {
  const sslDir = path.join(configDir(), "ssl");
  const caDir = path.join(sslDir, "demoCA");
  await fs.mkdir(caDir, { recursive: true });
  const keyPath = path.join(sslDir, `${hostname}-key.pem`);
  const certPath = path.join(sslDir, `${hostname}-cert.pem`);
  const caPath = path.join(caDir, "cacert.pem");
  const present = await Promise.all([keyPath, certPath, caPath].map((file) => fs.stat(file).then((stat) => stat.size > 0).catch(() => false)));
  if (present.every(Boolean)) return;

  await ensureImage(MAIL_IMAGE);
  const bind = `${sslDir.replace(/\\/g, "/")}:/certs`;
  const commands = [
    ["req", "-x509", "-newkey", "rsa:2048", "-sha256", "-nodes", "-days", "3650", "-keyout", `/certs/${hostname}-key.pem`, "-out", `/certs/${hostname}-cert.pem`, "-subj", `/CN=${hostname}`, "-addext", `subjectAltName=DNS:${hostname}`],
    ["req", "-x509", "-newkey", "rsa:2048", "-sha256", "-nodes", "-days", "3650", "-keyout", `/certs/${hostname}-key.pem`, "-out", `/certs/${hostname}-cert.pem`, "-subj", `/CN=${hostname}`],
  ];
  let exitCode = 1;
  for (const cmd of commands) {
    const created = await getDocker().createContainer({
      Image: MAIL_IMAGE,
      Entrypoint: ["openssl"],
      Cmd: cmd,
      HostConfig: { Binds: [bind] },
    });
    try {
      await created.start();
      exitCode = await waitForExit(created);
    } finally {
      await created.remove({ force: true }).catch(() => undefined);
    }
    if (exitCode === 0) break;
  }
  if (exitCode !== 0) throw new Error("mail_failed");
  await fs.copyFile(certPath, caPath);
}

function containerCrashed(info: { State: { Running: boolean; Restarting: boolean; ExitCode: number } } | null) {
  if (!info) return false;
  return info.State.Restarting || (!info.State.Running && info.State.ExitCode !== 0);
}

async function startMail(domain: string) {
  await ensureImage(MAIL_IMAGE);
  const volumes = volumeDirs();
  await Promise.all(Object.values(volumes).map((dir) => fs.mkdir(dir, { recursive: true })));
  const hostname = hostnameFor(domain);
  await ensureCertificates(hostname);
  const options = {
    name: MAIL_CONTAINER,
    Image: MAIL_IMAGE,
    Env: [
      `OVERRIDE_HOSTNAME=${hostname}`,
      "SSL_TYPE=self-signed",
      "ENABLE_RSPAMD=0",
      "ENABLE_CLAMAV=0",
      "ENABLE_FAIL2BAN=0",
      "ENABLE_OPENDKIM=1",
      "ENABLE_OPENDMARC=1",
      "ENABLE_POLICYD_SPF=1",
      "ENABLE_POP3=0",
      "POSTFIX_INET_PROTOCOLS=ipv4",
      "SPOOF_PROTECTION=1",
    ],
    ExposedPorts: {
      "25/tcp": {},
      "465/tcp": {},
      "587/tcp": {},
      "993/tcp": {},
    },
    HostConfig: {
      PortBindings: {
        "25/tcp": [{ HostPort: "25" }],
        "465/tcp": [{ HostPort: "465" }],
        "587/tcp": [{ HostPort: "587" }],
        "993/tcp": [{ HostPort: "993" }],
      },
      Binds: [
        `${volumes.config.replace(/\\/g, "/")}:/tmp/docker-mailserver`,
        `${volumes.data.replace(/\\/g, "/")}:/var/mail`,
        `${volumes.state.replace(/\\/g, "/")}:/var/mail-state`,
        `${volumes.logs.replace(/\\/g, "/")}:/var/log/mail`,
      ],
      RestartPolicy: { Name: "unless-stopped" as const },
    },
  };
  let created;
  try {
    created = await getDocker().createContainer({ ...options, Hostname: hostname });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!/hostname/i.test(message)) throw error;
    created = await getDocker().createContainer({ ...options, Hostname: "mail", Domainname: domain });
  }
  await created.start();
}

async function ensureMail(domain: string): Promise<{ ok: true } | { ok: false; error: MailError }> {
  const ping = await dockerPing();
  if (!ping.ok) return { ok: false, error: "docker_offline" };
  const expected = hostnameFor(domain);
  try {
    await ensureCertificates(expected);
  } catch {
    return { ok: false, error: "mail_failed" };
  }
  let info = await inspectMail();
  if (info && containerCrashed(info)) {
    await removeMail(false);
    info = null;
  }
  if (info && containerHostname(info) !== expected) {
    if (listMailboxes().length > 0) return { ok: false, error: "mail_failed" };
    await removeMail(true);
    info = null;
  }
  if (!info) {
    try {
      await startMail(domain);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (/already allocated|address already in use/i.test(message)) return { ok: false, error: "port_taken" };
      info = await inspectMail();
      if (!info) return { ok: false, error: "mail_failed" };
    }
  }
  info = await inspectMail();
  if (info && !info.State.Running) {
    try {
      await getDocker().getContainer(MAIL_CONTAINER).start();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (/already allocated|address already in use/i.test(message)) return { ok: false, error: "port_taken" };
      return { ok: false, error: "mail_failed" };
    }
  }
  return waitUntilReady();
}

function parseDkim(text: string) {
  const parts = [...text.matchAll(/"([^"]*)"/g)].map((match) => match[1]);
  const value = parts.join("").replace(/\s+/g, "");
  return value.includes("v=DKIM1") ? value : null;
}

export async function readDkim(domain: string) {
  const files = [
    path.join(configDir(), "opendkim", "keys", domain, "mail.txt"),
    path.join(configDir(), "rspamd", "dkim", `${domain}.mail.txt`),
  ];
  for (const file of files) {
    try {
      const value = parseDkim(await fs.readFile(file, "utf8"));
      if (value) return value;
    } catch {
      /* try the other layout */
    }
  }
  return null;
}

async function generateDkim(domain: string) {
  if (await readDkim(domain)) return;
  try {
    await runSetup(["config", "dkim", "domain", domain]);
  } catch {
    try {
      await runSetup(["config", "dkim"]);
    } catch {
      /* DNS record stays empty until the next domain save */
    }
  }
}

export function cloudflareZone(domain: string, address: string, dkim: string | null, panelHost = "") {
  const hostname = `mail.${domain}`;
  const lines = [
    `${hostname}.\t3600\tIN\tA\t${address}`,
    `${domain}.\t3600\tIN\tMX\t10\t${hostname}.`,
    `${domain}.\t3600\tIN\tTXT\t${quoteTxt(`v=spf1 mx a:${hostname} ~all`)}`,
    `_dmarc.${domain}.\t3600\tIN\tTXT\t${quoteTxt(`v=DMARC1; p=none; rua=mailto:postmaster@${domain}`)}`,
  ];
  if (panelHost === domain || panelHost.endsWith(`.${domain}`)) {
    lines.unshift(`${panelHost}.\t3600\tIN\tA\t${address}`);
  }
  if (dkim) lines.push(`mail._domainkey.${domain}.\t3600\tIN\tTXT\t${quoteTxt(dkim)}`);
  return `${lines.join("\n")}\n`;
}

function quoteTxt(value: string) {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const chunks: string[] = [];
  for (let index = 0; index < escaped.length; index += 255) chunks.push(escaped.slice(index, index + 255));
  return chunks.map((chunk) => `"${chunk}"`).join(" ");
}

export async function mailOverview() {
  const ping = await dockerPing();
  if (!ping.ok) return { docker: false, running: false };
  const info = await inspectMail();
  return { docker: true, running: Boolean(info?.State.Running) };
}

export async function configureMailDomain(domain: string) {
  if (!validMailDomain(domain)) return { ok: false as const, error: "validation" as const };
  const current = getMailDomain();
  if (current && current !== domain && listMailboxes().length > 0) {
    return { ok: false as const, error: "domain_locked" as const };
  }
  if (current !== domain) {
    await removeMail(true);
    setMailDomain(domain);
  } else if (listMailboxes().length === 0) {
    await removeMail(false);
  }
  const ready = await ensureMail(domain);
  if (!ready.ok) return ready;
  await generateDkim(domain);
  return { ok: true as const };
}

export async function createMailbox(local: string, password: string) {
  const domain = getMailDomain();
  if (!domain) return { ok: false as const, error: "domain_required" as const };
  const ready = await ensureMail(domain);
  if (!ready.ok) return ready;
  const address = `${local}@${domain}`;
  try {
    await runSetup(["email", "add", address, password]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/already exists|exists/i.test(message)) return { ok: false as const, error: "mail_taken" as const };
    try {
      await runSetup(["email", "del", "-y", address]);
    } catch {
      /* nothing was created */
    }
    return { ok: false as const, error: "mail_failed" as const };
  }
  return { ok: true as const, address };
}

export async function dropMailbox(address: string) {
  const domain = getMailDomain();
  if (!domain) return { ok: false as const, error: "domain_required" as const };
  const ready = await ensureMail(domain);
  if (!ready.ok) return ready;
  try {
    await runSetup(["email", "del", "-y", address]);
  } catch {
    return { ok: false as const, error: "mail_failed" as const };
  }
  return { ok: true as const };
}
