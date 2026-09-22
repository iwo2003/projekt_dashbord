import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { apiError, guard, readJson } from "@/lib/api";
import { hashPassword } from "@/lib/crypto";
import { findUserByUsername, insertUser, listUserRows, logEvent, toPublicUser } from "@/lib/db";
import { resolveRolePermissions } from "@/lib/permissions";
import { userCreateSchema } from "@/lib/schemas";

export const runtime = "nodejs";

export async function GET() {
  const auth = await guard("users.view");
  if (auth.error) return auth.error;
  return NextResponse.json({ users: listUserRows().map(toPublicUser) });
}

export async function POST(request: Request) {
  const auth = await guard("users.manage");
  if (auth.error) return auth.error;
  const parsed = userCreateSchema.safeParse(await readJson(request));
  if (!parsed.success) return apiError("weak_password", 400);
  const permissions = resolveRolePermissions(auth.user, parsed.data.role, parsed.data.permissions);
  if (permissions === "forbidden") return apiError("forbidden", 403);
  if (findUserByUsername(parsed.data.username)) return apiError("username_taken", 409);
  const id = randomUUID();
  insertUser({
    id,
    username: parsed.data.username,
    passwordHash: await hashPassword(parsed.data.password),
    isOwner: false,
    role: parsed.data.role,
    permissions,
  });
  logEvent(auth.user, "user.create", { name: parsed.data.username });
  return NextResponse.json({ ok: true });
}
