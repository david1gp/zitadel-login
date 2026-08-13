import { describe, expect, test } from "bun:test"

import type { WorkerBindings } from "../src/config/workerBindingsSchema"
import { zitadelClientCreate } from "../src/zitadel/zitadelClientCreate"

const identityOrigin = "https://identity.example"
const rpId = "login.example"

const bindings = {
  ZITADEL_ORIGIN: identityOrigin,
  ZITADEL_ORGANIZATION_ID: "org-1",
  ZITADEL_ALLOWED_CLIENT_IDS: ["client-1"],
  LOGIN_V2_FALLBACK_URL: `${identityOrigin}/ui/v2/login`,
  PAGES_ORIGIN: `https://${rpId}`,
  SESSION_LIFETIME_SECONDS: 900,
  ZITADEL_LOGIN_CLIENT_PAT: "test-pat-not-a-real-secret-value",
  FLOW_COOKIE_KEY: "A".repeat(43),
  FLOW_COOKIE_PREVIOUS_KEY: undefined,
  RECENT_ACCOUNT_COOKIE_KEY: "A".repeat(43),
  RECENT_ACCOUNT_COOKIE_PREVIOUS_KEY: undefined,
  ZITADEL_RECENT_ACCOUNT_V2_ENABLED: true,
  RATE_LIMITER: { limit: async () => ({ success: true }) },
} satisfies WorkerBindings

const creationOptions = {
  publicKey: {
    attestation: "none",
    authenticatorSelection: { userVerification: "required" },
    challenge: "challenge",
    excludeCredentials: [{ id: "existing", type: "public-key" }],
    pubKeyCredParams: [{ alg: -7, type: "public-key" }],
    rp: { id: rpId, name: "ZITADEL" },
    timeout: 300000,
    user: { displayName: "Test User", id: "user-handle", name: "test-user" },
  },
}

const credential = {
  id: "credential-id",
  rawId: "credential-id",
  response: { attestationObject: "attestation", clientDataJSON: "client-data" },
  type: "public-key",
}

function nativeCreate(response: Response | Error) {
  const calls: Array<{ method: string; url: string; body?: unknown }> = []
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = init?.body === undefined ? undefined : JSON.parse(String(init.body))
    calls.push({ method: init?.method ?? "GET", url: String(input), body })
    if (response instanceof Error) throw response
    return response
  }
  return { client: zitadelClientCreate(bindings, fetch), calls }
}

describe("zitadelClientCreate WebAuthn enrollment", () => {
  test("registers U2F with the v4.16 path and maps creation options", async () => {
    const native = nativeCreate(Response.json({ u2fId: "u2f-1", publicKeyCredentialCreationOptions: creationOptions }))

    const result = await native.client.registerU2F("user/id", rpId)

    expect(native.calls).toEqual([
      {
        method: "POST",
        url: `${identityOrigin}/v2/users/user%2Fid/u2f`,
        body: { domain: rpId },
      },
    ])
    expect(result).toEqual({
      success: true,
      data: { u2fId: "u2f-1", publicKeyCredentialCreationOptions: creationOptions },
    })
  })

  test("registers passkeys with the native path and contract body", async () => {
    const native = nativeCreate(
      Response.json({ passkeyId: "passkey-1", publicKeyCredentialCreationOptions: creationOptions }),
    )

    const result = await native.client.registerPasskey("user-1", rpId, "PASSKEY_AUTHENTICATOR_PLATFORM")

    expect(native.calls[0]).toEqual({
      method: "POST",
      url: `${identityOrigin}/v2/users/user-1/passkeys`,
      body: { domain: rpId, authenticator: "PASSKEY_AUTHENTICATOR_PLATFORM" },
    })
    expect(result).toEqual({
      success: true,
      data: { passkeyId: "passkey-1", publicKeyCredentialCreationOptions: creationOptions },
    })
  })

  test("verifies U2F and passkeys with bounded attestation bodies", async () => {
    const native = nativeCreate(Response.json({ details: { sequence: "3" } }))
    const passkeyNative = nativeCreate(Response.json({ details: { sequence: "3" } }))

    const u2fResult = await native.client.verifyU2FRegistration("user-1", "u2f-1", "YubiKey", credential)
    const passkeyResult = await passkeyNative.client.verifyPasskeyRegistration(
      "user-1",
      "passkey-1",
      "Laptop",
      credential,
    )

    expect(native.calls).toEqual([
      {
        method: "POST",
        url: `${identityOrigin}/v2/users/user-1/u2f/u2f-1`,
        body: { publicKeyCredential: credential, tokenName: "YubiKey" },
      },
    ])
    expect(passkeyNative.calls).toEqual([
      {
        method: "POST",
        url: `${identityOrigin}/v2/users/user-1/passkeys/passkey-1`,
        body: { publicKeyCredential: credential, passkeyName: "Laptop" },
      },
    ])
    expect(u2fResult).toEqual({ success: true, data: { details: { sequence: "3" } } })
    expect(passkeyResult).toEqual({ success: true, data: { details: { sequence: "3" } } })
  })

  test("rejects malformed options, wrong RP, and non-required verification before enrollment continues", async () => {
    const malformed = nativeCreate(Response.json({ u2fId: "u2f-1", publicKeyCredentialCreationOptions: {} }))
    const malformedResult = await malformed.client.registerU2F("user-1", rpId)

    const wrongRp = nativeCreate(
      Response.json({
        passkeyId: "passkey-1",
        publicKeyCredentialCreationOptions: {
          ...creationOptions,
          publicKey: { ...creationOptions.publicKey, rp: { id: "wrong.example", name: "ZITADEL" } },
        },
      }),
    )
    const wrongRpResult = await wrongRp.client.registerPasskey("user-1", rpId)

    const nonRequiredUv = nativeCreate(
      Response.json({
        passkeyId: "passkey-1",
        publicKeyCredentialCreationOptions: {
          ...creationOptions,
          publicKey: { ...creationOptions.publicKey, authenticatorSelection: { userVerification: "preferred" } },
        },
      }),
    )
    const nonRequiredUvResult = await nonRequiredUv.client.registerPasskey("user-1", rpId)

    expect(malformedResult.success).toBe(false)
    expect(wrongRpResult).toEqual({
      success: false,
      op: "registerPasskey",
      errorMessage: "ZITADEL returned an invalid relying party",
    })
    expect(nonRequiredUvResult.success).toBe(false)
  })

  test("bounds identifiers, names, domains, authenticator values, and credentials without requests", async () => {
    const native = nativeCreate(Response.json({}))
    const tooLong = "x".repeat(201)

    const results = await Promise.all([
      native.client.registerU2F("", rpId),
      native.client.registerU2F("user-1", "https://login.example"),
      native.client.registerPasskey("user-1", rpId, "UNKNOWN" as never),
      native.client.verifyU2FRegistration("user-1", tooLong, "YubiKey", credential),
      native.client.verifyPasskeyRegistration("user-1", "passkey-1", "", credential),
      native.client.verifyPasskeyRegistration("user-1", "passkey-1", "Laptop", {}),
    ])

    expect(results.every((result) => !result.success)).toBe(true)
    expect(native.calls).toHaveLength(0)
  })

  test("does not leak native failure payloads or transport errors", async () => {
    const rejected = nativeCreate(Response.json({ secret: "must-not-leak", error: "internal detail" }, { status: 502 }))
    const network = nativeCreate(new Error("must-not-leak"))

    const rejectedResult = await rejected.client.verifyPasskeyRegistration("user-1", "passkey-1", "Laptop", credential)
    const networkResult = await network.client.verifyU2FRegistration("user-1", "u2f-1", "YubiKey", credential)

    expect(rejectedResult).toEqual({
      success: false,
      op: "verifyPasskeyRegistration",
      errorMessage: "ZITADEL rejected the request",
      rawData: { status: 502 },
    })
    expect(networkResult).toEqual({
      success: false,
      op: "verifyU2FRegistration",
      errorMessage: "ZITADEL request failed",
    })
  })
})
