import { createReadStream } from "fs";
import { Readable } from "stream";
import { apiError, guard } from "@/lib/api";
import { getServer } from "@/lib/db";
import { FileError, fileForDownload } from "@/lib/files";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const auth = await guard("servers.files");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const server = getServer(id);
  if (!server) return apiError("not_found", 404);
  const rel = new URL(request.url).searchParams.get("path") ?? "";
  try {
    const file = await fileForDownload(server.volumePath, rel);
    const stream = Readable.toWeb(createReadStream(file.target)) as ReadableStream;
    return new Response(stream, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(file.name)}"`,
      },
    });
  } catch (error) {
    if (error instanceof FileError) return apiError(error.code, 404);
    console.error(error);
    return apiError("request_failed", 500);
  }
}
