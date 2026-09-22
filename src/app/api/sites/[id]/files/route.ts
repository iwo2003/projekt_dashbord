import { apiError, guard } from "@/lib/api";
import { logEvent } from "@/lib/db";
import { uploadSite } from "@/lib/sites";

export const runtime = "nodejs";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await guard("sites.manage");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const form = await request.formData();
  const files = form.getAll("files").filter((item): item is File => item instanceof File);
  if (files.length === 0) return apiError("validation", 400);
  const payload = [];
  for (const file of files) {
    payload.push({ name: file.name, data: Buffer.from(await file.arrayBuffer()) });
  }
  const saved = await uploadSite(id, payload);
  if (!saved.ok) {
    const status = saved.error === "too_large" ? 413 : saved.error === "not_found" ? 404 : 400;
    return apiError(saved.error, status);
  }
  logEvent(auth.user, "site.upload", { name: saved.site.name });
  return Response.json({ site: saved.site });
}
