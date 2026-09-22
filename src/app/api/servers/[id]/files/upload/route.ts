import { apiError, guard } from "@/lib/api";
import { getServer } from "@/lib/db";
import { FileError, saveUpload } from "@/lib/files";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await guard("servers.files.write");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const server = getServer(id);
  if (!server) return apiError("not_found", 404);
  const form = await request.formData();
  const file = form.get("file");
  const directory = String(form.get("path") ?? "");
  if (!(file instanceof File)) return apiError("validation", 400);
  try {
    const saved = await saveUpload(server.volumePath, directory, file.name, Buffer.from(await file.arrayBuffer()));
    return Response.json({ path: saved });
  } catch (error) {
    if (error instanceof FileError) return apiError(error.code, error.code === "too_large" ? 413 : 400);
    console.error(error);
    return apiError("request_failed", 500);
  }
}
