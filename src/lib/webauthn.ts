import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { isoBase64URL, isoUint8Array } from "@simplewebauthn/server/helpers";
import {
  helloCredential,
  insertHello,
  listHello,
  saveWebauthnChallenge,
  takeWebauthnChallenge,
  updateHelloCounter,
} from "./db";

export function webauthnRelyingParty(request: Request) {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host") || url.host;
  const hostname = host.replace(/:\d+$/, "");
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const visitor = request.headers.get("cf-visitor") ?? "";
  const cloudflareHttps = visitor.includes("https") || (Boolean(request.headers.get("cf-ray")) && hostname.includes("."));
  const proto = forwardedProto === "https" || cloudflareHttps ? "https" : forwardedProto || url.protocol.replace(":", "");
  const secure = proto === "https" || hostname === "localhost" || hostname === "127.0.0.1";
  const originHost = proto === "https" ? host.replace(/:443$/, "") : host.replace(/:80$/, "");
  return { rpID: hostname, origin: `${proto}://${originHost}`, secure };
}

function transportsOf(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function isRegistrationResponse(value: unknown): value is RegistrationResponseJSON {
  if (!value || typeof value !== "object") return false;
  const row = value as { id?: unknown; response?: { attestationObject?: unknown; clientDataJSON?: unknown } };
  return typeof row.id === "string" && typeof row.response?.attestationObject === "string" && typeof row.response.clientDataJSON === "string";
}

export function isAuthenticationResponse(value: unknown): value is AuthenticationResponseJSON {
  if (!value || typeof value !== "object") return false;
  const row = value as { id?: unknown; response?: { authenticatorData?: unknown; signature?: unknown; clientDataJSON?: unknown } };
  return (
    typeof row.id === "string" &&
    typeof row.response?.authenticatorData === "string" &&
    typeof row.response.signature === "string" &&
    typeof row.response.clientDataJSON === "string"
  );
}

export async function helloRegistrationOptions(userId: string, username: string, request: Request) {
  const party = webauthnRelyingParty(request);
  const options = await generateRegistrationOptions({
    rpName: "Helios",
    rpID: party.rpID,
    userName: username,
    userID: isoUint8Array.fromUTF8String(userId),
    userDisplayName: username,
    attestationType: "none",
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      residentKey: "preferred",
      userVerification: "required",
    },
    preferredAuthenticatorType: "localDevice",
    excludeCredentials: listHello(userId).map((row) => ({ id: row.id, transports: transportsOf(row.transports) })),
  });
  saveWebauthnChallenge(`reg:${userId}`, userId, options.challenge);
  return options;
}

export async function helloRegistrationVerify(userId: string, response: RegistrationResponseJSON, request: Request) {
  const expectedChallenge = takeWebauthnChallenge(`reg:${userId}`, userId);
  if (!expectedChallenge) return false;
  const party = webauthnRelyingParty(request);
  const verified = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: party.origin,
    expectedRPID: party.rpID,
    requireUserVerification: true,
  });
  if (!verified.verified) return false;
  const credential = verified.registrationInfo.credential;
  insertHello({
    id: credential.id,
    userId,
    publicKey: isoBase64URL.fromBuffer(credential.publicKey),
    counter: credential.counter,
    transports: response.response.transports ?? credential.transports ?? [],
  });
  return true;
}

export async function helloAuthenticationOptions(userId: string, challengeId: string, request: Request) {
  const party = webauthnRelyingParty(request);
  const options = await generateAuthenticationOptions({
    rpID: party.rpID,
    userVerification: "required",
    allowCredentials: listHello(userId).map((row) => ({ id: row.id, transports: transportsOf(row.transports) })),
  });
  saveWebauthnChallenge(challengeId, userId, options.challenge);
  return options;
}

export async function helloAuthenticationVerify(
  userId: string,
  challengeId: string,
  response: AuthenticationResponseJSON,
  request: Request,
) {
  const expectedChallenge = takeWebauthnChallenge(challengeId, userId);
  if (!expectedChallenge) return false;
  const stored = helloCredential(userId, response.id);
  if (!stored) return false;
  const party = webauthnRelyingParty(request);
  const verified = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: party.origin,
    expectedRPID: party.rpID,
    requireUserVerification: true,
    credential: {
      id: stored.id,
      publicKey: isoBase64URL.toBuffer(stored.public_key),
      counter: stored.counter,
      transports: transportsOf(stored.transports),
    },
  });
  if (!verified.verified) return false;
  updateHelloCounter(stored.id, verified.authenticationInfo.newCounter);
  return true;
}
