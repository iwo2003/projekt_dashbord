import { apiError, guard, readJson } from "@/lib/api";
import { hashPassword } from "@/lib/crypto";
import { deleteUser, findUserById, logEvent, toPublicUser, updateUser } from "@/lib/db";
import { resolveRolePermissions } from "@/lib/permissions";
import { userPatchSchema } from "@/lib/schemas";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await guard("users.manage");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const target = findUserById(id);
  if (!target) return apiError("not_found", 404);
  if (target.is_owner) return apiError("cannot_edit_owner", 403);
  if (target.id === auth.user.id) return apiError("cannot_edit_self", 403);
  const parsed = userPatchSchema.safeParse(await readJson(request));
  if (!parsed.success) return apiError("validation", 400);
  const permissions = resolveRolePermissions(auth.user, parsed.data.role, parsed.data.permissions);
  if (permissions === "forbidden") return apiError("forbidden", 403);
  updateUser(id, {
    role: parsed.data.role,
    permissions,
    ...(parsed.data.password ? { passwordHash: await hashPassword(parsed.data.password) } : {}),
  });
  logEvent(auth.user, "user.update", { name: target.username });
  const fresh = findUserById(id);
  return Response.json({ user: fresh ? toPublicUser(fresh) : null });
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const auth = await guard("users.manage");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const target = findUserById(id);
  if (!target) return apiError("not_found", 404);
  if (target.is_owner) return apiError("cannot_edit_owner", 403);
  if (target.id === auth.user.id) return apiError("cannot_delete_self", 403);
  deleteUser(id);
  logEvent(auth.user, "user.delete", { name: target.username });
  return Response.json({ ok: true });
}
