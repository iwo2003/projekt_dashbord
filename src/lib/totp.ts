import { Secret, TOTP } from "otpauth";
import QRCode from "qrcode";
import { APP_NAME } from "./constants";

export function createTotp(username: string) {
  const secret = new Secret({ size: 20 });
  const totp = new TOTP({
    issuer: APP_NAME,
    label: username,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret,
  });
  return { secret: secret.base32, uri: totp.toString() };
}

export async function totpQr(uri: string) {
  return QRCode.toDataURL(uri, {
    margin: 1,
    width: 280,
    color: { dark: "#17140c", light: "#fff8ea" },
  });
}

export function verifyTotp(secret: string, token: string) {
  const cleaned = token.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(cleaned)) return false;
  const totp = new TOTP({
    issuer: APP_NAME,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  });
  return totp.validate({ token: cleaned, window: 1 }) !== null;
}
