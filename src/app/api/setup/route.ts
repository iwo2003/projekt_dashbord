import { randomUUID } from "crypto";
import { apiError, readJson } from "@/lib/api";
import { hashPassword } from "@/lib/crypto";
import { hasUsers, insertUser, logEvent, withImmediate } from "@/lib/db";
import { setSessionCookie } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { setupSchema } from "@/lib/schemas";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ needsSetup: !hasUsers() });
}

export async function POST(request: Request) {
  const parsed = setupSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    const weak = parsed.error.issues.some((issue) => issue.path[0] === "password");
    return apiError(weak ? "weak_password" : "validation", 400);
  }
  const passwordHash = await hashPassword(parsed.data.password);
  const id = randomUUID();
  try {
    withImmediate(() => {
      if (hasUsers()) throw new Error("setup_closed");
      insertUser({
        id,
        username: parsed.data.username,
        passwordHash,
        isOwner: true,
        role: "owner",
        permissions: [...PERMISSIONS],
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "setup_closed") return apiError("setup_closed", 409);
    if (/UNIQUE/i.test(message)) return apiError("username_taken", 409);
    throw error;
  }
  await setSessionCookie(id);
  logEvent({ id, username: parsed.data.username }, "auth.login");
  return NextResponse.json({ ok: true });
}
