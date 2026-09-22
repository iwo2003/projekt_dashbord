import fs from "fs/promises";
import path from "path";

const TEXT_EXT = new Set([
  ".txt",
  ".yml",
  ".yaml",
  ".json",
  ".properties",
  ".conf",
  ".cfg",
  ".toml",
  ".ini",
  ".log",
  ".md",
  ".xml",
  ".csv",
  ".sk",
  ".lang",
  ".sh",
  ".js",
  ".ts",
  ".env",
  ".vdf",
]);

export class FileError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

function relativeInside(root: string, target: string) {
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new FileError("path_escape");
  }
  return relative;
}

export async function resolveInside(root: string, relPath: string) {
  const rootReal = await fs.realpath(root).catch(async () => {
    await fs.mkdir(root, { recursive: true });
    return fs.realpath(root);
  });
  const cleaned = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (cleaned.split("/").some((part) => part === "..")) throw new FileError("path_escape");
  const target = path.resolve(rootReal, cleaned);
  relativeInside(rootReal, target);
  return { root: rootReal, target, relative: cleaned };
}

export async function listDirectory(root: string, relPath: string) {
  const { target, relative } = await resolveInside(root, relPath);
  const stat = await fs.stat(target).catch(() => null);
  if (!stat || !stat.isDirectory()) throw new FileError("not_found");
  const dirents = await fs.readdir(target, { withFileTypes: true });
  const entries = await Promise.all(
    dirents.map(async (entry) => {
      const child = path.join(target, entry.name);
      const info = await fs.stat(child).catch(() => null);
      return {
        name: entry.name,
        type: entry.isDirectory() ? "dir" : "file",
        size: info?.size ?? 0,
        mtime: info?.mtimeMs ?? 0,
      };
    }),
  );
  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return { path: relative, entries };
}

export async function readTextFile(root: string, relPath: string) {
  const { target, relative } = await resolveInside(root, relPath);
  const stat = await fs.stat(target).catch(() => null);
  if (!stat || !stat.isFile()) throw new FileError("not_found");
  if (stat.size > 1_000_000) {
    return { path: relative, editable: false, size: stat.size, content: null as string | null };
  }
  const buffer = await fs.readFile(target);
  const ext = path.extname(target).toLowerCase();
  const binary = buffer.subarray(0, 8000).includes(0) || (ext !== "" && !TEXT_EXT.has(ext) && ext !== "");
  const knownText = ext === "" || TEXT_EXT.has(ext);
  const editable = knownText && !buffer.subarray(0, 8000).includes(0);
  if (binary && !editable) {
    return { path: relative, editable: false, size: stat.size, content: null as string | null };
  }
  return { path: relative, editable: true, size: stat.size, content: buffer.toString("utf8") };
}

export async function writeTextFile(root: string, relPath: string, content: string) {
  if (Buffer.byteLength(content) > 1_000_000) throw new FileError("too_large");
  const { target } = await resolveInside(root, relPath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, "utf8");
}

export async function makeDirectory(root: string, relPath: string) {
  const { target } = await resolveInside(root, relPath);
  await fs.mkdir(target, { recursive: true });
}

export async function removePath(root: string, relPath: string) {
  const { root: rootReal, target } = await resolveInside(root, relPath);
  if (target === rootReal) throw new FileError("path_escape");
  await fs.rm(target, { recursive: true, force: false });
}

export async function saveUpload(root: string, directory: string, filename: string, data: Buffer) {
  if (data.length > 25 * 1024 * 1024) throw new FileError("too_large");
  const safeName = path.basename(filename).replace(/[\\/]/g, "");
  if (!safeName || safeName === "." || safeName === "..") throw new FileError("validation");
  const rel = [directory.replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""), safeName]
    .filter(Boolean)
    .join("/");
  const { target } = await resolveInside(root, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, data);
  return rel;
}

export async function fileForDownload(root: string, relPath: string) {
  const { target, relative } = await resolveInside(root, relPath);
  const stat = await fs.stat(target);
  if (!stat.isFile()) throw new FileError("not_found");
  return { target, name: path.basename(target), relative, size: stat.size };
}
