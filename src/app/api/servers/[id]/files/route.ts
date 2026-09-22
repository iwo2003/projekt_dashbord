import { apiError, guard, readJson } from "@/lib/api";
import { getServer } from "@/lib/db";
import { FileError, listDirectory, makeDirectory, readTextFile, removePath, writeTextFile } from "@/lib/files";
import { can } from "@/lib/permissions";
import { fileWriteSchema } from "@/lib/schemas";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

function fail(error: unknown) {
  if (error instanceof FileError) {
    const status = error.code === "not_found" ? 404 : error.code === "too_large" ? 413 : 400;
    return apiError(error.code, status);
  }
  const message = error instanceof Error ? error.message : "";
  if (/EACCES|EPERM/.test(message)) return apiError("file_access", 403);
  console.error(error);
  return apiError("request_failed", 500);
}

export async function GET(request: Request, ctx: Ctx) {
  const auth = await guard("servers.files");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const server = getServer(id);
  if (!server) return apiError("not_found", 404);
  const rel = new URL(request.url).searchParams.get("path") ?? "";
  const mode = new URL(request.url).searchParams.get("mode");
  try {
    if (mode === "file") return Response.json(await readTextFile(server.volumePath, rel));
    return Response.json(await listDirectory(server.volumePath, rel));
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request, ctx: Ctx) {
  const auth = await guard("servers.files.write");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const server = getServer(id);
  if (!server) return apiError("not_found", 404);
  const parsed = fileWriteSchema.safeParse(await readJson(request));
  if (!parsed.success) return apiError("validation", 400);
  try {
    if (parsed.data.action === "mkdir") await makeDirectory(server.volumePath, parsed.data.path);
    else await writeTextFile(server.volumePath, parsed.data.path, parsed.data.content ?? "");
    return Response.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  const auth = await guard("servers.files.write");
  if (auth.error) return auth.error;
  if (!can(auth.user, "servers.files.write")) return apiError("forbidden", 403);
  const { id } = await ctx.params;
  const server = getServer(id);
  if (!server) return apiError("not_found", 404);
  const rel = new URL(request.url).searchParams.get("path") ?? "";
  try {
    await removePath(server.volumePath, rel);
    return Response.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
