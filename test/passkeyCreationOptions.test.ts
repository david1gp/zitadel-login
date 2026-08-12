import { describe, expect, test } from "bun:test"

import { passkeyAttestationSerialize } from "../client/src/passkey/model/passkeyAttestationSerialize"
import { passkeyCreationOptionsDecode } from "../client/src/passkey/model/passkeyCreationOptionsDecode"
import { passkeyCreationOptionsParse } from "../client/src/passkey/model/passkeyCreationOptionsParse"

const raw = {
  publicKey: {
    attestation: "none",
    authenticatorSelection: { userVerification: "required" },
    challenge: "GAOHYz2jE69kJMYo6Laij8yWw9-dKKgbViNhfuy0StA",
    pubKeyCredParams: [{ alg: -7, type: "public-key" }],
    rp: { id: "login.example", name: "Contentoren" },
    timeout: 300000,
    user: { displayName: "User", id: "dXNlci1pZA", name: "user@example.com" },
    excludeCredentials: [{ id: "ZXhpc3Rpbmc", type: "public-key", transports: ["usb"] }],
  },
}

describe("passkey creation options", () => {
  test("parses worker creation options and rejects unknown or invalid fields", () => {
    expect(passkeyCreationOptionsParse(raw).success).toBe(true)
    expect(passkeyCreationOptionsParse(raw.publicKey).success).toBe(true)
    expect(passkeyCreationOptionsParse({ publicKey: { ...raw.publicKey, extra: 1 } }).success).toBe(false)
    expect(passkeyCreationOptionsParse({ publicKey: { ...raw.publicKey, attestation: "direct" } }).success).toBe(false)
    expect(passkeyCreationOptionsParse({ publicKey: { ...raw.publicKey, challenge: "not base64!" } }).success).toBe(
      false,
    )
    expect(passkeyCreationOptionsParse(null).success).toBe(false)
  })

  test("decodes preserving relying party, authenticator selection and exclusions", () => {
    const parsed = passkeyCreationOptionsParse(raw)
    if (!parsed.success) throw new Error("expected success")
    const decoded = passkeyCreationOptionsDecode(parsed.data)

    expect(decoded.rp).toEqual({ id: "login.example", name: "Contentoren" })
    expect(decoded.authenticatorSelection).toEqual({ userVerification: "required" })
    expect(decoded.attestation).toBe("none")
    expect(decoded.timeout).toBe(300000)
    expect(new Uint8Array(decoded.challenge as ArrayBuffer).length).toBe(32)
    expect(new TextDecoder().decode(decoded.user.id as ArrayBuffer)).toBe("user-id")
    expect(decoded.excludeCredentials?.[0]?.transports).toEqual(["usb"])
  })

  test("serializes only the required attestation fields and rejects malformed responses", () => {
    const credential = {
      id: "cred-1",
      rawId: new Uint8Array([1, 2, 3]).buffer,
      type: "public-key",
      response: {
        attestationObject: new Uint8Array([4, 5, 6]).buffer,
        clientDataJSON: new Uint8Array([7, 8, 9]).buffer,
        getAuthenticatorData: () => undefined,
      },
    } as unknown as PublicKeyCredential

    const serialized = passkeyAttestationSerialize(credential)
    if (!serialized.success) throw new Error("expected success")
    expect(Object.keys(serialized.data).sort()).toEqual(["id", "rawId", "response", "type"])
    expect(Object.keys(serialized.data.response).sort()).toEqual(["attestationObject", "clientDataJSON"])
    expect(serialized.data.rawId).toBe("AQID")

    const malformed = { id: "x", type: "public-key", response: {} } as unknown as PublicKeyCredential
    expect(passkeyAttestationSerialize(malformed).success).toBe(false)
  })
})
