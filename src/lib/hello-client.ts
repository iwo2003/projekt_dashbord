"use client";

import { startAuthentication, startRegistration, WebAuthnError } from "@simplewebauthn/browser";
import type { AuthenticationResponseJSON, PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON, RegistrationResponseJSON } from "@simplewebauthn/browser";

export function helloClientError(caught: unknown) {
  if (caught instanceof WebAuthnError) {
    if (caught.code === "ERROR_CEREMONY_ABORTED" || caught.name === "NotAllowedError" || caught.name === "AbortError") {
      return "hello_cancelled";
    }
    if (
      caught.code === "ERROR_INVALID_DOMAIN" ||
      caught.code === "ERROR_INVALID_RP_ID" ||
      caught.name === "SecurityError" ||
      caught.name === "NotSupportedError"
    ) {
      return "hello_https";
    }
    return "hello_failed";
  }
  if (!window.isSecureContext) return "hello_https";
  if (caught instanceof Error) return caught.message;
  return "hello_failed";
}

export async function registerHello(optionsJSON: PublicKeyCredentialCreationOptionsJSON) {
  return startRegistration({ optionsJSON });
}

export async function authenticateHello(optionsJSON: PublicKeyCredentialRequestOptionsJSON) {
  return startAuthentication({ optionsJSON });
}

export type { AuthenticationResponseJSON, RegistrationResponseJSON };
