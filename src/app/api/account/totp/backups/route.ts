import { apiError, guard, readJson } from "@/lib/api";
import { issueBackupCodes } from "@/lib/auth";
import { userTotpSecret } from "@/lib/db";
import { codeSchema } from "@/lib/schemas";
import { verifyTotp } from "@/lib/totp";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await guard();
  if (auth.error) return auth.error;
  if (!auth.user.totpEnabled) return apiError("validation", 400);
  const parsed = codeSchema.safeParse(await readJson(request));
  if (!parsed.success) return apiError("validation", 400);
  const secret = userTotpSecret(auth.user.id);
  if (!secret || !verifyTotp(secret, parsed.data.code)) return apiError("invalid_totp", 401);
  const backupCodes = issueBackupCodes(auth.user.id);
  return Response.json({ backupCodes });
}
