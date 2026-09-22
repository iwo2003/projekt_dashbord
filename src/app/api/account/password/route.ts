import { apiError, guard, readJson } from "@/lib/api";
import { changePassword } from "@/lib/auth";
import { passwordChangeSchema } from "@/lib/schemas";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await guard();
  if (auth.error) return auth.error;
  const parsed = passwordChangeSchema.safeParse(await readJson(request));
  if (!parsed.success) return apiError("weak_password", 400);
  const ok = await changePassword(auth.user.id, parsed.data.current, parsed.data.next);
  if (!ok) return apiError("invalid_credentials", 401);
  return Response.json({ ok: true });
}
