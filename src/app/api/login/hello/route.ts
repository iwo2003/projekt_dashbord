import { apiError, readJson } from "@/lib/api";
import { clearRateLimit, clientIp, rateLimited, setSessionCookie } from "@/lib/auth";
import { countHello, deleteChallenge, findUserById, getChallenge, logEvent, updateUser } from "@/lib/db";
import { helloLoginSchema } from "@/lib/schemas";
import { helloAuthenticationOptions, helloAuthenticationVerify, isAuthenticationResponse, webauthnRelyingParty } from "@/lib/webauthn";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const ip = clientIp(request);
  if (rateLimited(`hello:${ip}`, 12)) return apiError("rate_limited", 429);
  if (!webauthnRelyingParty(request).secure) return apiError("hello_https", 400);
  const body = await readJson(request);
  const parsed = helloLoginSchema.safeParse(body);
  if (!parsed.success) return apiError("validation", 400);
  const challenge = getChallenge(parsed.data.challengeId);
  if (!challenge || challenge.expires_at < Date.now()) return apiError("challenge_expired", 401);
  if (countHello(challenge.user_id) < 1) return apiError("hello_missing", 400);
  if (!parsed.data.response) {
    try {
      const options = await helloAuthenticationOptions(challenge.user_id, challenge.id, request);
      return NextResponse.json(options);
    } catch {
      return apiError("hello_failed", 400);
    }
  }
  if (!isAuthenticationResponse(parsed.data.response)) return apiError("validation", 400);
  try {
    const ok = await helloAuthenticationVerify(challenge.user_id, challenge.id, parsed.data.response, request);
    if (!ok) return apiError("hello_failed", 401);
  } catch {
    return apiError("hello_failed", 401);
  }
  deleteChallenge(challenge.id);
  updateUser(challenge.user_id, { lastLoginAt: Date.now() });
  await setSessionCookie(challenge.user_id);
  clearRateLimit(`hello:${ip}`);
  clearRateLimit(`login:${ip}`);
  const user = findUserById(challenge.user_id);
  if (user) logEvent({ id: user.id, username: user.username }, "auth.login");
  return NextResponse.json({ ok: true });
}
