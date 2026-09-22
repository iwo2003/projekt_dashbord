import { execFile } from "child_process";
import fs from "fs";
import { promisify } from "util";
import { getSetting } from "./db";
import { FTP_PASSIVE_END, FTP_PASSIVE_START, FTP_PORT, SFTP_PORT } from "./remote";

const execFileAsync = promisify(execFile);

export const PANEL_PORT = 3000;

export const FIREWALL_SERVICES = [
  { id: "minecraft", rules: [{ port: "25565", proto: "tcp" as const }] },
  {
    id: "cs2",
    rules: [
      { port: "27015", proto: "tcp" as const },
      { port: "27015", proto: "udp" as const },
      { port: "27020", proto: "udp" as const },
    ],
  },
  { id: "mysql", rules: [{ port: "3306", proto: "tcp" as const }] },
  {
    id: "ftp",
    rules: [
      { port: String(FTP_PORT), proto: "tcp" as const },
      { port: `${FTP_PASSIVE_START}:${FTP_PASSIVE_END}`, proto: "tcp" as const },
    ],
  },
  {
    id: "mail",
    rules: [
      { port: "25", proto: "tcp" as const },
      { port: "465", proto: "tcp" as const },
      { port: "587", proto: "tcp" as const },
      { port: "993", proto: "tcp" as const },
    ],
  },
] as const;

export type FirewallProto = "tcp" | "udp";

export type PortRule = { port: string; proto: FirewallProto };

type ListedRule = { spec: string; action: string };

export type LockedPort = { port: string; proto: "tcp"; reasons: Array<"ssh" | "panel" | "sftp" | "https"> };

let binary: string | null = null;

function panelPorts() {
  const ports = new Set<number>([PANEL_PORT]);
  const fromEnv = Number(process.env.PORT);
  if (Number.isInteger(fromEnv) && fromEnv >= 1 && fromEnv <= 65535) ports.add(fromEnv);
  return [...ports];
}

export function sshTcpPorts() {
  const ports = new Set<number>([22]);
  try {
    const text = fs.readFileSync("/etc/ssh/sshd_config", "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = /^Port\s+(\d+)/i.exec(trimmed);
      if (!match) continue;
      const port = Number(match[1]);
      if (port >= 1 && port <= 65535) ports.add(port);
    }
  } catch {
    /* keep the default SSH port */
  }
  return [...ports];
}

export function lockedPorts(): LockedPort[] {
  const byPort = new Map<number, LockedPort>();
  function add(port: number, reason: LockedPort["reasons"][number]) {
    const current = byPort.get(port) ?? { port: String(port), proto: "tcp" as const, reasons: [] };
    if (!current.reasons.includes(reason)) current.reasons.push(reason);
    byPort.set(port, current);
  }
  for (const port of sshTcpPorts()) add(port, "ssh");
  for (const port of panelPorts()) add(port, "panel");
  add(SFTP_PORT, "sftp");
  if (getSetting("https_domain")) {
    add(80, "https");
    add(443, "https");
  }
  return [...byPort.values()];
}

export function parsePortSpec(port: string, proto: FirewallProto) {
  const match = /^(\d{1,5})(?::(\d{1,5}))?$/.exec(port);
  if (!match) return null;
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : start;
  if (start < 1 || end > 65535 || start > end || end - start > 100) return null;
  const spec = end === start ? `${start}/${proto}` : `${start}:${end}/${proto}`;
  return { start, end, proto, spec };
}

function overlapsLocked(spec: string) {
  const match = /^(\d{1,5})(?::(\d{1,5}))?\/(tcp|udp)$/.exec(spec);
  if (!match || match[3] !== "tcp") return false;
  const start = Number(match[1]);
  const end = Number(match[2] ?? match[1]);
  return lockedPorts().some((rule) => {
    const port = Number(rule.port);
    return port >= start && port <= end;
  });
}

async function ufwBinary() {
  if (binary) return binary;
  if (process.platform !== "linux") throw new Error("firewall_unavailable");
  for (const candidate of ["/usr/sbin/ufw", "ufw"]) {
    try {
      await execFileAsync(candidate, ["version"], { timeout: 5000 });
      binary = candidate;
      return candidate;
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "ENOENT") continue;
      binary = candidate;
      return candidate;
    }
  }
  throw new Error("firewall_unavailable");
}

async function ufw(args: string[]) {
  const bin = await ufwBinary();
  try {
    const { stdout, stderr } = await execFileAsync(bin, args, { timeout: 20000 });
    return `${stdout}\n${stderr}`;
  } catch (error) {
    const failed = error as { code?: string; stdout?: string; stderr?: string };
    if (failed.code === "ENOENT") throw new Error("firewall_unavailable");
    const output = `${failed.stdout ?? ""}\n${failed.stderr ?? ""}`;
    if (/Could not delete non-existent rule/i.test(output)) return output;
    if (/need to be root|superuser|permission denied/i.test(output)) throw new Error("firewall_denied");
    throw new Error("firewall_failed");
  }
}

function parseStatus(text: string) {
  const active = /Status:\s+active/i.test(text);
  const rules: ListedRule[] = [];
  let inTable = false;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (/^--\s+------/.test(line)) {
      inTable = true;
      continue;
    }
    if (!inTable || !line || /\(v6\)/.test(line)) continue;
    const match = /^(\S+)\s+(ALLOW|DENY|REJECT|LIMIT)\b/i.exec(line);
    if (!match) continue;
    rules.push({ spec: match[1].toLowerCase(), action: match[2].toUpperCase() });
  }
  return { active, rules };
}

export function ruleOpen(rules: ListedRule[], port: string, proto: FirewallProto) {
  return rules.some((rule) => rule.action === "ALLOW" && rule.spec === `${port}/${proto}`.toLowerCase());
}

async function readStatus() {
  return parseStatus(await ufw(["status", "verbose"]));
}

async function heal(rules: ListedRule[]) {
  for (const rule of lockedPorts()) {
    const spec = `${rule.port}/${rule.proto}`;
    if (rules.some((item) => item.action === "ALLOW" && item.spec === spec)) continue;
    await ufw(["allow", spec]);
  }
}

export async function firewallSnapshot() {
  try {
    await ufwBinary();
  } catch (error) {
    const code = error instanceof Error ? error.message : "firewall_unavailable";
    if (code === "firewall_unavailable") return { available: false as const, active: false, rules: [] as ListedRule[] };
    throw error;
  }
  let status = await readStatus();
  if (status.active) {
    await heal(status.rules);
    status = await readStatus();
  }
  return { available: true as const, active: status.active, rules: status.rules };
}

export async function enableFirewall() {
  for (const rule of lockedPorts()) {
    await ufw(["allow", `${rule.port}/${rule.proto}`]);
  }
  await ufw(["default", "deny", "incoming"]);
  await ufw(["default", "allow", "outgoing"]);
  try {
    await ufw(["default", "allow", "routed"]);
  } catch {
    /* older ufw has no routed policy; Docker keeps the installed FORWARD rule */
  }
  await ufw(["--force", "enable"]);
}

export async function disableFirewall() {
  await ufw(["disable"]);
}

export async function allowPort(port: string, proto: FirewallProto) {
  const parsed = parsePortSpec(port, proto);
  if (!parsed) return { ok: false as const, error: "validation" as const };
  await ufw(["allow", parsed.spec]);
  return { ok: true as const };
}

export async function closePort(port: string, proto: FirewallProto) {
  const parsed = parsePortSpec(port, proto);
  if (!parsed) return { ok: false as const, error: "validation" as const };
  if (overlapsLocked(parsed.spec)) return { ok: false as const, error: "firewall_protected" as const };
  await ufw(["--force", "delete", "allow", parsed.spec]);
  const status = await readStatus();
  if (status.active) await heal(status.rules);
  return { ok: true as const };
}
