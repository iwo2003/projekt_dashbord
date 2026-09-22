import { apiError, guard, readJson } from "@/lib/api";
import { checkPassword, issueBackupCodes } from "@/lib/auth";
import { logEvent, updateUser, userTotpSecret } from "@/lib/db";
import { disableTotpSchema, codeSchema } from "@/lib/schemas";
import { createTotp, totpQr, verifyTotp } from "@/lib/totp";

export const runtime = "nodejs";

export async function POST() {
  const auth = await guard();
  if (auth.error) return auth.error;
  if (auth.user.totpEnabled) return apiError("validation", 400);
  const created = createTotp(auth.user.username);
  updateUser(auth.user.id, { totpSecret: created.secret, totpEnabled: false });
  const qr = await totpQr(created.uri);
  return Response.json({ qr, secret: created.secret });
}

export async function PUT(request: Request) {
  const auth = await guard();
  if (auth.error) return auth.error;
  const parsed = codeSchema.safeParse(await readJson(request));
  if (!parsed.success) return apiError("validation", 400);
  const secret = userTotpSecret(auth.user.id);
  if (!secret || !verifyTotp(secret, parsed.data.code)) return apiError("invalid_totp", 401);
  const backupCodes = issueBackupCodes(auth.user.id);
  updateUser(auth.user.id, { totpEnabled: true });
  logEvent(auth.user, "auth.totp_on");
  return Response.json({ backupCodes });
}

export async function DELETE(request: Request) {
  const auth = await guard();
  if (auth.error) return auth.error;
  const parsed = disableTotpSchema.safeParse(await readJson(request));
  if (!parsed.success) return apiError("validation", 400);
  const passwordOk = await checkPassword(auth.user.id, parsed.data.password);
  const secret = userTotpSecret(auth.user.id);
  if (!passwordOk || !secret || !verifyTotp(secret, parsed.data.code)) return apiError("invalid_totp", 401);
  updateUser(auth.user.id, { totpEnabled: false, totpSecret: null, backupCodes: [] });
  logEvent(auth.user, "auth.totp_off");
  return Response.json({ ok: true });
}
