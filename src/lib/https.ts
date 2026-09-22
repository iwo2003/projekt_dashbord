import fs from "fs/promises";
import path from "path";
import { getSetting, setSetting } from "./db";
import { dockerPing, ensureImage, getDocker } from "./docker";
import { allowPort, PANEL_PORT } from "./firewall";
import { hostAddress } from "./metrics";

const CONTAINER = "helios-caddy";
const IMAGE = "caddy:2";

function rootDir() {
  return path.join(process.cwd(), "data", "caddy");
}

const PANEL_HOST = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

export function panelListenPort() {
  const raw = Number(process.env.PORT || PANEL_PORT);
  return Number.isInteger(raw) && raw > 0 && raw < 65536 ? raw : PANEL_PORT;
}

export function accessOverview() {
  const port = panelListenPort();
  return {
    port,
    direct: `http://${hostAddress()}:${port}`,
    address: hostAddress(),
    host: getSetting("panel_host"),
    attached: getSetting("panel_attach"),
    tls: getSetting("panel_attach_tls") === "1",
  };
}

function cleanHost(raw: string) {
  const withoutScheme = raw.trim().toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  const host = withoutScheme.split("/")[0] ?? "";
  return host.replace(/:\d+$/, "").replace(/\.$/, "");
}

export function savePanelHost(host: string) {
  const value = cleanHost(host);
  if (!value) {
    setSetting("panel_host", "");
    return { ok: true as const, host: "" };
  }
  if (value.length > 253 || !PANEL_HOST.test(value)) return { ok: false as const, error: "validation" as const };
  setSetting("panel_host", value);
  return { ok: true as const, host: value };
}

export function httpsStatus() {
  return { domain: getSetting("https_domain") };
}

export async function httpsRunning() {
  try {
    const info = await getDocker().getContainer(CONTAINER).inspect();
    return Boolean(info.State.Running);
  } catch {
    return false;
  }
}

function caddyDomains(text: string) {
  const found: string[] = [];
  for (const line of text.split("\n")) {
    const match = /^([a-z0-9.-]+\.[a-z0-9.-]+)\s*\{/.exec(line.trim());
    if (match?.[1] && PANEL_HOST.test(match[1])) found.push(match[1]);
  }
  return found;
}

function caddyFile(domains: string[], listenPort: string) {
  const unique = [...new Set(domains)];
  return `{
	email postmaster@${unique[0]}
}
${unique.map((domain) => `${domain} {\n\treverse_proxy 127.0.0.1:${listenPort}\n}`).join("\n")}
`;
}

async function startCaddy(domains: string[]) {
  const unique = [...new Set(domains.map((domain) => domain.trim().toLowerCase()))].filter((domain) => PANEL_HOST.test(domain));
  if (unique.length === 0) return { ok: false as const, error: "validation" as const };
  if (process.platform !== "linux") return { ok: false as const, error: "https_unavailable" as const };
  const ping = await dockerPing();
  if (!ping.ok) return { ok: false as const, error: "docker_offline" as const };
  const dir = rootDir();
  await fs.mkdir(path.join(dir, "data"), { recursive: true });
  await fs.mkdir(path.join(dir, "config"), { recursive: true });
  const listenPort = process.env.PORT || String(PANEL_PORT);
  await fs.writeFile(path.join(dir, "Caddyfile"), caddyFile(unique, listenPort));
  try {
    await getDocker().getContainer(CONTAINER).remove({ force: true });
  } catch {
    /* first start */
  }
  await ensureImage(IMAGE);
  const created = await getDocker().createContainer({
    name: CONTAINER,
    Image: IMAGE,
    User: "0:0",
    HostConfig: {
      NetworkMode: "host",
      Binds: [
        `${dir.replace(/\\/g, "/")}/Caddyfile:/etc/caddy/Caddyfile:ro`,
        `${dir.replace(/\\/g, "/")}/data:/data`,
        `${dir.replace(/\\/g, "/")}/config:/config`,
      ],
      RestartPolicy: { Name: "unless-stopped" },
    },
  });
  await allowPort("80", "tcp").catch(() => undefined);
  await allowPort("443", "tcp").catch(() => undefined);
  try {
    await created.start();
  } catch {
    await created.remove({ force: true }).catch(() => undefined);
    return { ok: false as const, error: "https_failed" as const };
  }
  setSetting("https_domain", unique[0] ?? "");
  return { ok: true as const };
}

export async function enableHttps(domain: string) {
  let existing: string[] = [];
  try {
    existing = caddyDomains(await fs.readFile(path.join(rootDir(), "Caddyfile"), "utf8"));
  } catch {
    existing = [];
  }
  return startCaddy([domain, ...existing]);
}

export async function addHttpsDomain(domain: string) {
  return enableHttps(domain);
}

export async function disableHttps() {
  try {
    await getDocker().getContainer(CONTAINER).remove({ force: true });
  } catch {
    /* already gone */
  }
  setSetting("https_domain", "");
  return { ok: true as const };
}
