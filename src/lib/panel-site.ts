import { execFile } from "child_process";
import fs from "fs/promises";
import path from "path";
import { promisify } from "util";
import { getSetting, setSetting } from "./db";
import { addHttpsDomain, disableHttps, panelListenPort, savePanelHost } from "./https";
import { execCommand, getDocker } from "./docker";
import { caddyBeside, nginxBeside } from "./panel-snippets";

const execFileAsync = promisify(execFile);

const NGINX_FILE = "helios-panel.conf";
const APACHE_FILE = "helios-panel.conf";
const CADDY_SNIPPET = "/etc/caddy/helios-panel.caddy";
const CADDY_IMPORT = "import /etc/caddy/helios-panel.caddy";

type AttachError = "validation" | "site_unavailable" | "site_failed" | "site_denied" | "docker_offline" | "https_unavailable" | "https_failed";
type Via = "nginx" | "apache" | "caddy" | "helios";

function denied(error: unknown) {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "EACCES" || code === "EPERM";
}

async function run(command: string, args: string[], timeout = 20000) {
  return execFileAsync(command, args, { timeout });
}

async function unitActive(name: string) {
  try {
    const { stdout } = await run("systemctl", ["is-active", name], 8000);
    return stdout.trim() === "active";
  } catch (error) {
    const stdout = String((error as { stdout?: string }).stdout ?? "");
    return stdout.trim() === "active";
  }
}

async function listening(port: number) {
  try {
    const { stdout } = await run("ss", ["-ltn"], 8000);
    return new RegExp(`:${port}(?!\\d)`).test(stdout);
  } catch {
    return false;
  }
}

async function nginxBin() {
  for (const bin of ["/usr/sbin/nginx", "nginx"]) {
    try {
      await run(bin, ["-t"], 15000);
      return bin;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      return bin;
    }
  }
  return "";
}

function apacheSnippet(host: string, port: number) {
  return `<VirtualHost *:80>
    ServerName ${host}
    ProxyPreserveHost On
    RequestHeader set X-Forwarded-Proto expr=%{REQUEST_SCHEME}
    ProxyPass / http://127.0.0.1:${port}/
    ProxyPassReverse / http://127.0.0.1:${port}/
</VirtualHost>
`;
}

async function tryCertbot(kind: "nginx" | "apache", host: string) {
  try {
    await run(
      "certbot",
      ["--" + kind, "-d", host, "--non-interactive", "--agree-tos", "--register-unsafely-without-email", "--keep-until-expiring"],
      90000,
    );
    return true;
  } catch {
    return false;
  }
}

async function installNginx(host: string, port: number) {
  const bin = await nginxBin();
  if (!bin) return { ok: false as const, error: "site_unavailable" as const };
  let file = `/etc/nginx/conf.d/${NGINX_FILE}`;
  let link = "";
  try {
    await fs.access("/etc/nginx/sites-available");
    await fs.access("/etc/nginx/sites-enabled");
    file = `/etc/nginx/sites-available/${NGINX_FILE}`;
    link = `/etc/nginx/sites-enabled/${NGINX_FILE}`;
  } catch {
    /* conf.d */
  }
  try {
    await run(bin, ["-t"]);
  } catch (error) {
    return { ok: false as const, error: denied(error) ? ("site_denied" as const) : ("site_failed" as const) };
  }
  await fs.writeFile(file, nginxBeside(host, port));
  if (link) {
    await fs.rm(link, { force: true });
    await fs.symlink(file, link);
  }
  try {
    await run(bin, ["-t"]);
    await run("systemctl", ["reload", "nginx"]);
  } catch (error) {
    await fs.rm(link || file, { force: true });
    if (link) await fs.rm(file, { force: true });
    return { ok: false as const, error: denied(error) ? ("site_denied" as const) : ("site_failed" as const) };
  }
  const tls = await tryCertbot("nginx", host);
  return { ok: true as const, tls };
}

async function installApache(host: string, port: number) {
  const file = `/etc/apache2/sites-available/${APACHE_FILE}`;
  try {
    await run("apache2ctl", ["configtest"]);
  } catch (error) {
    return { ok: false as const, error: denied(error) ? ("site_denied" as const) : ("site_failed" as const) };
  }
  await fs.writeFile(file, apacheSnippet(host, port));
  try {
    await run("a2enmod", ["proxy", "proxy_http", "headers"]);
    await run("a2ensite", ["helios-panel"]);
    await run("apache2ctl", ["configtest"]);
    await run("systemctl", ["reload", "apache2"]);
  } catch (error) {
    await run("a2dissite", ["helios-panel"]).catch(() => undefined);
    await fs.rm(file, { force: true });
    return { ok: false as const, error: denied(error) ? ("site_denied" as const) : ("site_failed" as const) };
  }
  const tls = await tryCertbot("apache", host);
  return { ok: true as const, tls };
}

async function installCaddy(host: string, port: number) {
  const file = "/etc/caddy/Caddyfile";
  let original = "";
  try {
    original = await fs.readFile(file, "utf8");
  } catch (error) {
    return { ok: false as const, error: denied(error) ? ("site_denied" as const) : ("site_unavailable" as const) };
  }
  if (original.includes('"apps"')) return { ok: false as const, error: "site_unavailable" as const };
  await fs.writeFile(CADDY_SNIPPET, caddyBeside(host, port));
  const next = original.includes(CADDY_IMPORT) ? original : `${original.trimEnd()}\n${CADDY_IMPORT}\n`;
  await fs.writeFile(file, next);
  try {
    await run("caddy", ["validate", "--config", file]);
    await run("systemctl", ["reload", "caddy"]);
  } catch (error) {
    await fs.writeFile(file, original);
    await fs.rm(CADDY_SNIPPET, { force: true });
    return { ok: false as const, error: denied(error) ? ("site_denied" as const) : ("site_failed" as const) };
  }
  return { ok: true as const, tls: true };
}

async function removeOwnFiles() {
  await fs.rm(`/etc/nginx/sites-enabled/${NGINX_FILE}`, { force: true });
  await fs.rm(`/etc/nginx/sites-available/${NGINX_FILE}`, { force: true });
  await fs.rm(`/etc/nginx/conf.d/${NGINX_FILE}`, { force: true });
  await fs.rm(`/etc/apache2/sites-enabled/${APACHE_FILE}`, { force: true });
  await fs.rm(`/etc/apache2/sites-available/${APACHE_FILE}`, { force: true });
  await fs.rm(CADDY_SNIPPET, { force: true });
  try {
    const file = "/etc/caddy/Caddyfile";
    const text = await fs.readFile(file, "utf8");
    if (text.includes(CADDY_IMPORT)) {
      await fs.writeFile(file, text.replaceAll(`${CADDY_IMPORT}\n`, "").replaceAll(CADDY_IMPORT, ""));
    }
  } catch {
    /* no host caddy */
  }
}

export async function detachPanelSite() {
  const via = getSetting("panel_attach");
  if (via === "helios") await disableHttps();
  if (process.platform === "linux" && via && via !== "helios") {
    await removeOwnFiles();
    if (via === "nginx") await run("systemctl", ["reload", "nginx"]).catch(() => undefined);
    if (via === "apache") await run("systemctl", ["reload", "apache2"]).catch(() => undefined);
    if (via === "caddy") await run("systemctl", ["reload", "caddy"]).catch(() => undefined);
  }
  setSetting("panel_attach", "");
  setSetting("panel_attach_tls", "");
}

function remember(via: Via, tls: boolean) {
  setSetting("panel_attach", via);
  setSetting("panel_attach_tls", tls ? "1" : "");
}

export async function syncWwwVhosts(domains: string[]) {
  if (process.platform !== "linux") return "direct" as const;
  const nginx = domains
    .map(
      (domain) => `server {
    listen 80;
    server_name ${domain};
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
`,
    )
    .join("\n");
  const apache = domains
    .map(
      (domain) => `<VirtualHost *:80>
    ServerName ${domain}
    ProxyPreserveHost On
    ProxyPass / http://127.0.0.1:8080/
    ProxyPassReverse / http://127.0.0.1:8080/
</VirtualHost>
`,
    )
    .join("\n");
  const caddy = domains.map((domain) => `${domain} {\n    reverse_proxy 127.0.0.1:8080\n}\n`).join("\n");
  if (await unitActive("nginx")) {
    await writeHostFile("nginx", nginx);
    return "nginx" as const;
  }
  if (await unitActive("apache2")) {
    await writeHostFile("apache", apache);
    return "apache" as const;
  }
  if (await unitActive("caddy")) {
    await writeHostFile("caddy", caddy);
    return "caddy" as const;
  }
  if (await listening(80)) return "local" as const;
  return "direct" as const;
}

async function writeHostFile(kind: "nginx" | "apache" | "caddy", body: string) {
  if (kind === "nginx") {
    let file = "/etc/nginx/conf.d/helios-www.conf";
    let link = "";
    try {
      await fs.access("/etc/nginx/sites-available");
      await fs.access("/etc/nginx/sites-enabled");
      file = "/etc/nginx/sites-available/helios-www.conf";
      link = "/etc/nginx/sites-enabled/helios-www.conf";
    } catch {
      /* conf.d */
    }
    if (!body.trim()) {
      await fs.rm(link || file, { force: true });
      if (link) await fs.rm(file, { force: true });
    } else {
      await fs.writeFile(file, body);
      if (link) {
        await fs.rm(link, { force: true });
        await fs.symlink(file, link);
      }
    }
    const bin = (await nginxBin()) || "nginx";
    try {
      await run(bin, ["-t"]);
      try {
        await run("systemctl", ["reload", "nginx"]);
      } catch {
        await run(bin, ["-s", "reload"]);
      }
    } catch (error) {
      await fs.rm(link || file, { force: true });
      if (link) await fs.rm(file, { force: true });
      throw error;
    }
    return;
  }
  if (kind === "apache") {
    const file = "/etc/apache2/sites-available/helios-www.conf";
    if (!body.trim()) {
      await run("a2dissite", ["helios-www"]).catch(() => undefined);
      await fs.rm(file, { force: true });
    } else {
      await fs.writeFile(file, body);
      await run("a2enmod", ["proxy", "proxy_http"]);
      await run("a2ensite", ["helios-www"]);
    }
    await run("apache2ctl", ["configtest"]);
    await run("systemctl", ["reload", "apache2"]);
    return;
  }
  const snippet = "/etc/caddy/helios-www.caddy";
  const main = "/etc/caddy/Caddyfile";
  const importLine = "import /etc/caddy/helios-www.caddy";
  if (!body.trim()) {
    await fs.rm(snippet, { force: true });
  } else {
    await fs.writeFile(snippet, body);
  }
  try {
    const original = await fs.readFile(main, "utf8");
    if (!original.includes('"apps"')) {
      const next = body.trim()
        ? original.includes(importLine)
          ? original
          : `${original.trimEnd()}\n${importLine}\n`
        : original.replaceAll(`${importLine}\n`, "").replaceAll(importLine, "");
      await fs.writeFile(main, next);
      try {
        await run("caddy", ["validate", "--config", main]);
      } catch (error) {
        await fs.writeFile(main, original);
        throw error;
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  await run("systemctl", ["reload", "caddy"]);
}

async function portPrograms(port: number) {
  try {
    const { stdout } = await run("ss", ["-ltnp"], 8000);
    const names: string[] = [];
    for (const line of stdout.split("\n")) {
      if (!new RegExp(`:${port}(?!\\d)`).test(line)) continue;
      for (const match of line.matchAll(/\("([^"]+)"/g)) {
        if (match[1]) names.push(match[1]);
      }
    }
    return names;
  } catch {
    return [];
  }
}

async function dockerWebNames() {
  const names: string[] = [];
  try {
    const listed = await getDocker().listContainers();
    for (const item of listed) {
      const name = (item.Names?.[0] ?? "").replace(/^\//, "");
      const publishes = (item.Ports ?? []).some((entry) => entry.PublicPort === 80 || entry.PublicPort === 443);
      const hostNetwork = item.HostConfig?.NetworkMode === "host";
      if (publishes || (hostNetwork && (name === "helios-caddy" || name === "helios-sites"))) names.push(name);
    }
  } catch {
    /* docker answers later */
  }
  return names;
}

async function proxyOnSitesContainer(host: string, panelPort: number) {
  const conf = path.join(process.cwd(), "data", "sites", "nginx.conf");
  let text = "";
  try {
    text = await fs.readFile(conf, "utf8");
  } catch {
    return false;
  }
  let gateway = "172.17.0.1";
  try {
    const info = await getDocker().getContainer("helios-sites").inspect();
    gateway = Object.values(info.NetworkSettings.Networks ?? {})[0]?.Gateway || gateway;
  } catch {
    return false;
  }
  if (!text.includes(`server_name ${host};`)) {
    text += `
server {
    listen 80;
    server_name ${host};
    location / {
        proxy_pass http://${gateway}:${panelPort};
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
`;
    await fs.writeFile(conf, text);
  }
  await execCommand("helios-sites", ["nginx", "-s", "reload"]);
  return true;
}

export async function attachPanelSite(rawHost: string): Promise<
  | { ok: true; host: string; attached: Via | ""; tls: boolean }
  | { ok: false; error: AttachError }
> {
  const saved = savePanelHost(rawHost);
  if (!saved.ok) return saved;
  if (!saved.host) {
    await detachPanelSite();
    return { ok: true, host: "", attached: "", tls: false };
  }
  if (process.platform !== "linux") return { ok: false, error: "site_unavailable" };
  const port = panelListenPort();
  try {
    if (await unitActive("nginx")) {
      const installed = await installNginx(saved.host, port);
      if (!installed.ok) return installed;
      remember("nginx", installed.tls);
      return { ok: true, host: saved.host, attached: "nginx", tls: installed.tls };
    }
    if (await unitActive("apache2")) {
      const installed = await installApache(saved.host, port);
      if (!installed.ok) return installed;
      remember("apache", installed.tls);
      return { ok: true, host: saved.host, attached: "apache", tls: installed.tls };
    }
    if (await unitActive("caddy")) {
      const installed = await installCaddy(saved.host, port);
      if (!installed.ok) return installed;
      remember("caddy", installed.tls);
      return { ok: true, host: saved.host, attached: "caddy", tls: true };
    }
    const programs = [...(await portPrograms(80)), ...(await portPrograms(443))];
    const publishers = await dockerWebNames();
    if (programs.some((name) => name.includes("nginx"))) {
      const installed = await installNginx(saved.host, port);
      if (installed.ok) {
        remember("nginx", installed.tls);
        return { ok: true, host: saved.host, attached: "nginx", tls: installed.tls };
      }
    }
    if (programs.some((name) => name.includes("apache") || name === "httpd")) {
      const installed = await installApache(saved.host, port);
      if (installed.ok) {
        remember("apache", installed.tls);
        return { ok: true, host: saved.host, attached: "apache", tls: installed.tls };
      }
    }
    if (publishers.includes("helios-sites")) {
      const proxied = await proxyOnSitesContainer(saved.host, port).catch(() => false);
      if (proxied) {
        remember("nginx", false);
        return { ok: true, host: saved.host, attached: "nginx", tls: false };
      }
    }
    const started = await addHttpsDomain(saved.host);
    if (!started.ok) return started;
    remember("helios", true);
    return { ok: true, host: saved.host, attached: "helios", tls: true };
  } catch (error) {
    return { ok: false, error: denied(error) ? "site_denied" : "site_failed" };
  }
}
