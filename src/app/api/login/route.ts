import { apiError, readJson } from "@/lib/api";
import { clearRateLimit, clientIp, loginWithPassword, rateLimited } from "@/lib/auth";
import { logEvent } from "@/lib/db";
import { loginSchema } from "@/lib/schemas";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const ip = clientIp(request);
  if (rateLimited(`login:${ip}`)) return apiError("rate_limited", 429);
  const parsed = loginSchema.safeParse(await readJson(request));
  if (!parsed.success) return apiError("validation", 400);
  const result = await loginWithPassword(parsed.data.username, parsed.data.password);
  if (!result.ok) return apiError(result.reason, 401);
  if (result.totpRequired) return NextResponse.json({ totpRequired: true, challengeId: result.challengeId });
  clearRateLimit(`login:${ip}`);
  logEvent(result.user, "auth.login");
  return NextResponse.json({ ok: true, user: result.user });
}
