import { cookies, headers } from "next/headers";
import { randomUUID } from "crypto";
import {
  bumpChallenge,
  deleteChallenge,
  deleteSession,
  deleteUserSessions,
  findSessionUser,
  findUserById,
  findUserByUsername,
  getChallenge,
  insertChallenge,
  insertSession,
  purgeExpired,
  toPublicUser,
  updateUser,
  userBackupHashes,
  userPasswordHash,
  userTotpSecret,
} from "./db";
import {
  generateBackupCodes,
  hashBackupCodes,
  hashPassword,
  normalizeBackupCode,
  randomSecret,
  safeEqualHex,
  sha256,
  verifyPassword,
} from "./crypto";
import { verifyTotp } from "./totp";
import type { PublicUser } from "./types";

const COOKIE = "helios_session";
const fails = new Map<string, { count: number; reset: number }>();

export function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "local";
  return "local";
}

export function rateLimited(key: string, limit = 8, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const row = fails.get(key);
  if (!row || row.reset < now) {
    fails.set(key, { count: 1, reset: now + windowMs });
    return false;
  }
  row.count += 1;
  return row.count > limit;
}

export function clearRateLimit(key: string) {
  fails.delete(key);
}

async function cookieJar() {
  return cookies();
}

async function sessionCookieSecure() {
  if (process.env.HELIOS_HTTPS === "1") return true;
  if (process.env.HELIOS_HTTPS === "0") return false;
  const headerStore = await headers();
  return headerStore.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https";
}

export async function setSessionCookie(userId: string) {
  const token = randomSecret(32);
  insertSession(sha256(token), userId);
  const jar = await cookieJar();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: await sessionCookieSecure(),
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
}

export async function clearSessionCookie() {
  const jar = await cookieJar();
  const token = jar.get(COOKIE)?.value;
  if (token) deleteSession(sha256(token));
  jar.set(COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: await sessionCookieSecure(),
    path: "/",
    maxAge: 0,
  });
}

export async function getCurrentUser(): Promise<PublicUser | null> {
  purgeExpired();
  const jar = await cookieJar();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const row = findSessionUser(sha256(token));
  return row ? toPublicUser(row) : null;
}

export async function checkPassword(userId: string, password: string) {
  const hash = userPasswordHash(userId);
  if (!hash) return false;
  return verifyPassword(password, hash);
}

export async function loginWithPassword(username: string, password: string) {
  const row = findUserByUsername(username);
  if (!row) return { ok: false as const, reason: "invalid_credentials" as const };
  const valid = await verifyPassword(password, row.password_hash);
  if (!valid) return { ok: false as const, reason: "invalid_credentials" as const };
  if (row.totp_enabled === 1 && row.totp_secret) {
    const challengeId = randomUUID();
    insertChallenge(challengeId, row.id);
    return { ok: true as const, totpRequired: true as const, challengeId };
  }
  updateUser(row.id, { lastLoginAt: Date.now() });
  await setSessionCookie(row.id);
  return { ok: true as const, totpRequired: false as const, user: toPublicUser(findUserById(row.id)!) };
}

export async function loginWithTotp(challengeId: string, code: string) {
  const challenge = getChallenge(challengeId);
  if (!challenge || challenge.expires_at < Date.now()) {
    return { ok: false as const, reason: "challenge_expired" as const };
  }
  if (challenge.attempts >= 5) {
    deleteChallenge(challengeId);
    return { ok: false as const, reason: "rate_limited" as const };
  }
  const row = findUserById(challenge.user_id);
  if (!row) return { ok: false as const, reason: "challenge_expired" as const };
  const secret = userTotpSecret(row.id);
  const totpOk = secret ? verifyTotp(secret, code) : false;
  const backupOk = !totpOk && consumeBackupCode(row.id, code);
  if (!totpOk && !backupOk) {
    bumpChallenge(challengeId);
    return { ok: false as const, reason: "invalid_totp" as const };
  }
  deleteChallenge(challengeId);
  updateUser(row.id, { lastLoginAt: Date.now() });
  await setSessionCookie(row.id);
  return { ok: true as const, user: toPublicUser(findUserById(row.id)!) };
}

export function consumeBackupCode(userId: string, code: string) {
  const hashes = userBackupHashes(userId);
  const target = sha256(normalizeBackupCode(code));
  const index = hashes.findIndex((hash) => safeEqualHex(hash, target));
  if (index < 0) return false;
  hashes.splice(index, 1);
  updateUser(userId, { backupCodes: hashes });
  return true;
}

export async function changePassword(userId: string, current: string, next: string) {
  const row = findUserById(userId);
  if (!row) return false;
  const valid = await verifyPassword(current, row.password_hash);
  if (!valid) return false;
  const passwordHash = await hashPassword(next);
  deleteUserSessions(userId);
  updateUser(userId, { passwordHash });
  await setSessionCookie(userId);
  return true;
}

export function issueBackupCodes(userId: string) {
  const codes = generateBackupCodes();
  updateUser(userId, { backupCodes: hashBackupCodes(codes) });
  return codes;
}
