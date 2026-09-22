import { execFile } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";
import { randomUUID } from "crypto";
import {
  deleteSiteRow,
  getSiteRow,
  insertSite,
  listSiteRows,
  setSitePhpFlag,
  siteDomainTaken,
  type SiteRow,
} from "./db";
import { dockerPing, ensureImage, getDocker } from "./docker";
import { allowPort } from "./firewall";
import { hostAddress } from "./metrics";
import { syncWwwVhosts } from "./panel-site";
import { disableRemote } from "./remote";

const execFileAsync = promisify(execFile);
const CONTAINER = "helios-sites";
const PHP_CONTAINER = "helios-php";
const PHP_IMAGE = "helios-php:8.3";
const IMAGE = "nginx:1.27-alpine";
const DOMAIN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const FILE_NAME = /^[A-Za-z0-9._-]{1,120}$/;

function rootDir() {
  return path.join(process.cwd(), "data", "sites");
}

function siteDir(id: string) {
  return path.join(rootDir(), id);
}

function cleanDomain(raw: string) {
  const withoutScheme = raw.trim().toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  const host = withoutScheme.split("/")[0] ?? "";
  return host.replace(/:\d+$/, "").replace(/\.$/, "");
}

const PHP_DOCKERFILE = `FROM php:8.3-fpm-alpine
RUN apk add --no-cache --virtual .build \${PHPIZE_DEPS} \\
 && docker-php-ext-install pdo_mysql mysqli opcache \\
 && apk del .build
`;

const PHP_INI = `expose_php=0
display_errors=0
log_errors=1
cgi.fix_pathinfo=0
allow_url_include=0
memory_limit=256M
upload_max_filesize=40M
post_max_size=40M
date.timezone=UTC
`;

function nginxConf(sites: SiteRow[]) {
  const blocks = sites.map((site, index) => {
    const flag = index === 0 ? " default_server" : "";
    const php = site.php
      ? `
    index index.php index.html;
    client_max_body_size 40m;
    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }
    location ~ \\.php$ {
        try_files $uri =404;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        fastcgi_param PHP_VALUE "open_basedir=/srv/sites/${site.id}:/tmp";
        fastcgi_hide_header X-Powered-By;
        resolver 127.0.0.11 valid=10s ipv6=off;
        set $phpfpm helios-php:9000;
        fastcgi_pass $phpfpm;
    }`
      : `
    index index.html;
    location / {
        try_files $uri $uri/ =404;
    }
    location ~ \\.php$ {
        return 404;
    }`;
    return `server {
    listen 80${flag};
    server_name ${site.domain};
    root /srv/sites/${site.id};
    location ~ /\\. {
        deny all;
    }${php}
}
`;
  });
  return blocks.join("\n");
}

async function publish(sites: SiteRow[]) {
  const dir = rootDir();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "nginx.conf"), nginxConf(sites) || emptyServer());
  const mode = await syncWwwVhosts(sites.map((site) => site.domain));
  const ports =
    mode === "direct"
      ? [
          { HostPort: "80" },
          { HostIp: "127.0.0.1", HostPort: "8080" },
        ]
      : [{ HostIp: "127.0.0.1", HostPort: "8080" }];
  const php = sites.some((site) => site.php);
  if (php) await ensurePhp(dir);
  else await removeContainer(PHP_CONTAINER);
  try {
    await getDocker().getContainer(CONTAINER).remove({ force: true });
  } catch {
    /* first start */
  }
  if (sites.length === 0) return { running: false, mode };
  await ensureImage(IMAGE);
  const created = await getDocker().createContainer({
    name: CONTAINER,
    Image: IMAGE,
    HostConfig: {
      NetworkMode: php ? "helios-web" : "bridge",
      PortBindings: { "80/tcp": ports },
      Binds: [
        `${dir.replace(/\\/g, "/")}:/srv/sites:ro`,
        `${path.join(dir, "nginx.conf").replace(/\\/g, "/")}:/etc/nginx/conf.d/default.conf:ro`,
      ],
      RestartPolicy: { Name: "unless-stopped" },
    },
  });
  await created.start();
  await fs.writeFile(path.join(dir, "mode.txt"), mode);
  if (mode === "direct") await allowPort("80", "tcp").catch(() => undefined);
  return { running: true, mode };
}

function emptyServer() {
  return `server {
    listen 80 default_server;
    server_name _;
    return 404;
}
`;
}

async function removeContainer(name: string) {
  try {
    await getDocker().getContainer(name).remove({ force: true });
  } catch {
    /* already gone */
  }
}

async function ensurePhp(dir: string) {
  try {
    await startPhp(dir);
  } catch (error) {
    if (error instanceof Error && error.message === "php_failed") throw error;
    throw new Error("php_failed");
  }
}

async function startPhp(dir: string) {
  const phpDir = path.join(dir, "php");
  await fs.mkdir(phpDir, { recursive: true });
  await fs.writeFile(path.join(phpDir, "Dockerfile"), PHP_DOCKERFILE);
  await fs.writeFile(path.join(phpDir, "helios.ini"), PHP_INI);
  try {
    await getDocker().getImage(PHP_IMAGE).inspect();
  } catch {
    const stream = await getDocker().buildImage({ context: phpDir, src: ["Dockerfile"] }, { t: PHP_IMAGE });
    const modem = getDocker().modem as unknown as {
      followProgress: (source: NodeJS.ReadableStream, done: (err: Error | null) => void) => void;
    };
    await new Promise<void>((resolve, reject) => {
      modem.followProgress(stream, (error) => (error ? reject(error) : resolve()));
    }).catch(() => {
      throw new Error("php_failed");
    });
  }
  try {
    await getDocker().getNetwork("helios-web").inspect();
  } catch {
    await getDocker().createNetwork({ Name: "helios-web" });
  }
  await removeContainer(PHP_CONTAINER);
  const created = await getDocker().createContainer({
    name: PHP_CONTAINER,
    Image: PHP_IMAGE,
    HostConfig: {
      NetworkMode: "helios-web",
      Binds: [
        `${dir.replace(/\\/g, "/")}:/srv/sites`,
        `${path.join(phpDir, "helios.ini").replace(/\\/g, "/")}:/usr/local/etc/php/conf.d/helios.ini:ro`,
      ],
      RestartPolicy: { Name: "unless-stopped" },
    },
  });
  await created.start();
  try {
    await getDocker().getNetwork("helios-web").connect({ Container: "helios-mysql" });
  } catch {
    /* MySQL is off, or it is already on this network */
  }
}

export async function sitesOverview() {
  const sites = listSiteRows();
  let running = false;
  try {
    const info = await getDocker().getContainer(CONTAINER).inspect();
    running = Boolean(info.State.Running);
  } catch {
    running = false;
  }
  let mode = "local";
  try {
    mode = (await fs.readFile(path.join(rootDir(), "mode.txt"), "utf8")).trim() || "local";
  } catch {
    mode = "local";
  }
  const host = hostAddress();
  const listed = await Promise.all(sites.map((site) => present(site, running, mode, host)));
  return { sites: listed, running, mode, host };
}

async function present(site: SiteRow, running: boolean, mode: string, host: string) {
  let files: string[] = [];
  try {
    files = (await fs.readdir(siteDir(site.id))).slice(0, 40);
  } catch {
    files = [];
  }
  const url = !running ? "" : mode === "local" ? `http://${host}:8080` : `http://${site.domain}`;
  return {
    id: site.id,
    name: site.name,
    domain: site.domain,
    url,
    files,
    php: site.php,
    createdAt: site.createdAt,
  };
}

export async function createSite(userId: string, name: string, domainRaw: string, php: boolean) {
  const nameTrim = name.trim();
  const domain = cleanDomain(domainRaw);
  if (nameTrim.length < 2 || nameTrim.length > 40 || !DOMAIN.test(domain)) {
    return { ok: false as const, error: "validation" as const };
  }
  if (siteDomainTaken(domain)) return { ok: false as const, error: "site_taken" as const };
  const ping = await dockerPing();
  if (!ping.ok) return { ok: false as const, error: "docker_offline" as const };
  const row: SiteRow = {
    id: randomUUID(),
    name: nameTrim,
    domain,
    php,
    createdBy: userId,
    createdAt: Date.now(),
  };
  await fs.mkdir(siteDir(row.id), { recursive: true });
  if (php) await fs.chmod(siteDir(row.id), 0o777).catch(() => undefined);
  await fs.writeFile(
    path.join(siteDir(row.id), php ? "index.php" : "index.html"),
    php
      ? "<?php echo \"PHP \".PHP_VERSION; ?>\n"
      : `<!doctype html>\n<meta charset="utf-8">\n<title>${escapeHtml(nameTrim)}</title>\n<p>${escapeHtml(nameTrim)}</p>\n`,
  );
  insertSite(row);
  try {
    await publish(listSiteRows());
  } catch (error) {
    deleteSiteRow(row.id);
    await fs.rm(siteDir(row.id), { recursive: true, force: true });
    const code = error instanceof Error && error.message === "php_failed" ? "php_failed" : "site_failed";
    return { ok: false as const, error: code };
  }
  return { ok: true as const, site: await present(row, true, "direct", hostAddress()) };
}

export async function setSitePhp(id: string, enabled: boolean) {
  const site = getSiteRow(id);
  if (!site) return { ok: false as const, error: "not_found" as const };
  if (site.php === enabled) return { ok: true as const };
  setSitePhpFlag(id, enabled);
  if (enabled) {
    await fs.mkdir(siteDir(id), { recursive: true });
    await fs.chmod(siteDir(id), 0o777).catch(() => undefined);
    if (!(await exists(path.join(siteDir(id), "index.php")))) {
      await fs.writeFile(path.join(siteDir(id), "index.php"), "<?php echo \"PHP \".PHP_VERSION; ?>\n");
    }
  }
  try {
    await publish(listSiteRows());
  } catch (error) {
    setSitePhpFlag(id, site.php);
    const code = error instanceof Error && error.message === "php_failed" ? "php_failed" : "site_failed";
    return { ok: false as const, error: code };
  }
  return { ok: true as const };
}

export async function removeSite(id: string) {
  const site = getSiteRow(id);
  if (!site) return { ok: false as const, error: "not_found" as const };
  const rest = listSiteRows().filter((item) => item.id !== id);
  try {
    await publish(rest);
  } catch {
    return { ok: false as const, error: "site_failed" as const };
  }
  await disableRemote(id);
  deleteSiteRow(id);
  await fs.rm(siteDir(id), { recursive: true, force: true });
  return { ok: true as const };
}

export async function uploadSite(id: string, files: { name: string; data: Buffer }[]) {
  const site = getSiteRow(id);
  if (!site) return { ok: false as const, error: "not_found" as const };
  const dir = siteDir(id);
  await fs.mkdir(dir, { recursive: true });
  for (const file of files) {
    if (file.data.length > 40 * 1024 * 1024) return { ok: false as const, error: "too_large" as const };
    if (file.name.toLowerCase().endsWith(".zip")) {
      const extracted = await extractZip(file.data, dir);
      if (!extracted.ok) return extracted;
      continue;
    }
    const base = path.basename(file.name).replace(/[\\/]/g, "");
    if (!FILE_NAME.test(base)) return { ok: false as const, error: "validation" as const };
    await fs.writeFile(path.join(dir, base), file.data);
  }
  await flattenSingleFolder(dir);
  return { ok: true as const, site: await present(site, true, "direct", hostAddress()) };
}

async function extractZip(data: Buffer, dest: string) {
  const tmp = path.join(os.tmpdir(), `helios-site-${randomUUID()}.zip`);
  await fs.writeFile(tmp, data);
  try {
    const { stdout } = await execFileAsync("tar", ["-tf", tmp], { timeout: 20000 });
    const names = stdout.split(/\r?\n/).filter(Boolean);
    if (names.length === 0 || names.length > 2000) return { ok: false as const, error: "site_archive" as const };
    for (const name of names) {
      const normalized = path.posix.normalize(name.replace(/\\/g, "/"));
      if (!normalized || normalized.startsWith("/") || normalized === ".." || normalized.startsWith("../") || normalized.includes("/../")) {
        return { ok: false as const, error: "path_escape" as const };
      }
    }
    await execFileAsync("tar", ["-xf", tmp, "-C", dest], { timeout: 30000 });
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "site_archive" as const };
  } finally {
    await fs.rm(tmp, { force: true });
  }
}

async function flattenSingleFolder(dest: string) {
  if ((await exists(path.join(dest, "index.html"))) || (await exists(path.join(dest, "index.php")))) return;
  const entries = await fs.readdir(dest);
  if (entries.length !== 1) return;
  const only = path.join(dest, entries[0] ?? "");
  const stat = await fs.stat(only).catch(() => null);
  if (!stat?.isDirectory()) return;
  if (!(await exists(path.join(only, "index.html"))) && !(await exists(path.join(only, "index.php")))) return;
  for (const name of await fs.readdir(only)) {
    await fs.rename(path.join(only, name), path.join(dest, name));
  }
  await fs.rmdir(only);
}

async function exists(target: string) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char] ?? char);
}
