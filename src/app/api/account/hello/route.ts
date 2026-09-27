import { apiError, guard, readJson } from "@/lib/api";
import { checkPassword } from "@/lib/auth";
import { countHello, deleteHello, logEvent } from "@/lib/db";
import { passwordOnlySchema } from "@/lib/schemas";
import { helloRegistrationOptions, helloRegistrationVerify, isRegistrationResponse, webauthnRelyingParty } from "@/lib/webauthn";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await guard();
  if (auth.error) return auth.error;
  if (!webauthnRelyingParty(request).secure) return apiError("hello_https", 400);
  if (countHello(auth.user.id) > 0) return apiError("validation", 400);
  try {
    const options = await helloRegistrationOptions(auth.user.id, auth.user.username, request);
    return Response.json(options);
  } catch {
    return apiError("hello_failed", 400);
  }
}

export async function PUT(request: Request) {
  const auth = await guard();
  if (auth.error) return auth.error;
  if (!webauthnRelyingParty(request).secure) return apiError("hello_https", 400);
  const body = await readJson(request);
  if (!isRegistrationResponse(body)) return apiError("validation", 400);
  try {
    const ok = await helloRegistrationVerify(auth.user.id, body, request);
    if (!ok) return apiError("hello_failed", 400);
  } catch {
    return apiError("hello_failed", 400);
  }
  logEvent(auth.user, "auth.hello_on");
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await guard();
  if (auth.error) return auth.error;
  const parsed = passwordOnlySchema.safeParse(await readJson(request));
  if (!parsed.success) return apiError("validation", 400);
  if (!(await checkPassword(auth.user.id, parsed.data.password))) return apiError("invalid_credentials", 401);
  deleteHello(auth.user.id);
  logEvent(auth.user, "auth.hello_off");
  return Response.json({ ok: true });
}
