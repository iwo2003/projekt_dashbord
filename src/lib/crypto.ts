import { createHash, randomBytes, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function randomId() {
  return randomBytes(16).toString("hex");
}

export function randomSecret(bytes = 18) {
  return randomBytes(bytes).toString("base64url");
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hash, "hex");
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(expected, derived);
}

export function safeEqualHex(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function normalizeBackupCode(code: string) {
  return code.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function generateBackupCodes() {
  const codes: string[] = [];
  for (let index = 0; index < 8; index += 1) {
    const raw = randomBytes(4).toString("hex");
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4)}`);
  }
  return codes;
}

export function hashBackupCodes(codes: string[]) {
  return codes.map((code) => sha256(normalizeBackupCode(code)));
}
