import { apiError, readJson } from "@/lib/api";
import { clearRateLimit, clientIp, loginWithTotp, rateLimited } from "@/lib/auth";
import { logEvent } from "@/lib/db";
import { totpLoginSchema } from "@/lib/schemas";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const ip = clientIp(request);
  if (rateLimited(`totp:${ip}`, 12)) return apiError("rate_limited", 429);
  const parsed = totpLoginSchema.safeParse(await readJson(request));
  if (!parsed.success) return apiError("validation", 400);
  const result = await loginWithTotp(parsed.data.challengeId, parsed.data.code);
  if (!result.ok) return apiError(result.reason, 401);
  clearRateLimit(`totp:${ip}`);
  clearRateLimit(`login:${ip}`);
  logEvent(result.user, "auth.login");
  return Response.json({ ok: true, user: result.user });
}
