import fs from "fs/promises";
import path from "path";
import { getSetting, listSiteRows, setSetting } from "./db";
import { dockerPing, ensureImage, getDocker } from "./docker";
import { writeConfigFile } from "./files";
import { openPublicWeb, PANEL_PORT } from "./firewall";
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

function panelHosts(extra: string[] = []) {
  return [
    ...new Set(
      [getSetting("panel_host"), getSetting("https_domain"), ...extra]
        .map((host) => host.trim().toLowerCase())
        .filter((host) => PANEL_HOST.test(host)),
    ),
  ];
}

function caddyRoutes(panel: string[], listenPort: string) {
  const taken = new Set(panel);
  const routes = panel.map((host) => ({ host, upstream: `127.0.0.1:${listenPort}` }));
  for (const site of listSiteRows()) {
    if (taken.has(site.domain) || !PANEL_HOST.test(site.domain)) continue;
    taken.add(site.domain);
    routes.push({ host: site.domain, upstream: "127.0.0.1:8080" });
  }
  return routes;
}

function caddyFile(routes: { host: string; upstream: string }[]) {
  const blocks = routes.flatMap((route) => [
    `http://${route.host} {\n\treverse_proxy ${route.upstream}\n}`,
    `${route.host} {\n\treverse_proxy ${route.upstream}\n}`,
  ]);
  return `{
	email postmaster@${routes[0]?.host ?? "localhost"}
	auto_https disable_redirects
}
${blocks.join("\n")}
`;
}

async function releaseSitePort80() {
  try {
    const container = getDocker().getContainer("helios-sites");
    const info = await container.inspect();
    const bindings = info.HostConfig?.PortBindings?.["80/tcp"] ?? [];
    const holdsPublic80 = bindings.some((item: { HostPort?: string; HostIp?: string }) => item.HostPort === "80" && (!item.HostIp || item.HostIp === "0.0.0.0" || item.HostIp === "::"));
    if (holdsPublic80) await container.stop({ t: 2 }).catch(() => undefined);
  } catch {
    /* the site container is already gone */
  }
}

function dockerText(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function startCaddy(domains: string[]) {
  const panel = panelHosts(domains);
  const listenPort = process.env.PORT || String(PANEL_PORT);
  const routes = caddyRoutes(panel, listenPort);
  if (routes.length === 0) return { ok: false as const, error: "validation" as const };
  if (process.platform !== "linux") return { ok: false as const, error: "https_unavailable" as const };
  const ping = await dockerPing();
  if (!ping.ok) return { ok: false as const, error: "docker_offline" as const };
  const dir = rootDir();
  try {
    await fs.mkdir(path.join(dir, "data"), { recursive: true });
    await fs.mkdir(path.join(dir, "config"), { recursive: true });
    try {
      await getDocker().getContainer(CONTAINER).remove({ force: true });
    } catch {
      /* first start */
    }
    await writeConfigFile(path.join(dir, "Caddyfile"), caddyFile(routes));
    await releaseSitePort80();
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
    await openPublicWeb();
    try {
      await created.start();
    } catch (error) {
      await created.remove({ force: true }).catch(() => undefined);
      return { ok: false as const, error: "https_failed" as const, detail: dockerText(error) };
    }
  } catch (error) {
    return { ok: false as const, error: "https_failed" as const, detail: dockerText(error) };
  }
  if (panel[0]) setSetting("https_domain", panel[0]);
  return { ok: true as const };
}

export async function refreshCaddyRoutes() {
  if (!(await httpsRunning())) return false;
  const started = await startCaddy(panelHosts());
  return started.ok;
}

export async function enableHttps(domain: string) {
  return startCaddy(panelHosts([domain]));
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
