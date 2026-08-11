import { describe, expect, test } from "bun:test"

import { passkeyAssertionSerialize } from "../client/src/passkey/model/passkeyAssertionSerialize"

function textToBuffer(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

describe("passkeyAssertionSerialize", () => {
  test("serializes PublicKeyCredential assertion response into base64url strings without secret leak", () => {
    const fakeCredential = {
      id: "ATmqBg-99qyOZk2zloPdJQyS2R7IkFT7v9Hoos_B_nM",
      rawId: textToBuffer("credential-raw-id-1234567890"),
      type: "public-key" as const,
      response: {
        clientDataJSON: textToBuffer('{"type":"webauthn.get","challenge":"test"}'),
        authenticatorData: textToBuffer("auth-data-bytes-1234567890"),
        signature: textToBuffer("signature-bytes-1234567890"),
        userHandle: textToBuffer("user-1"),
      },
    } as unknown as PublicKeyCredential

    const serialized = passkeyAssertionSerialize(fakeCredential)

    expect(serialized.id).toBe("ATmqBg-99qyOZk2zloPdJQyS2R7IkFT7v9Hoos_B_nM")
    expect(serialized.type).toBe("public-key")
    expect(typeof serialized.rawId).toBe("string")
    expect(typeof serialized.response.clientDataJSON).toBe("string")
    expect(typeof serialized.response.authenticatorData).toBe("string")
    expect(typeof serialized.response.signature).toBe("string")
    expect(typeof serialized.response.userHandle).toBe("string")
    expect(serialized.response.userHandle).not.toContain(" ")
  })

  test("handles null or empty userHandle safely", () => {
    const fakeCredential = {
      id: "credential-id-1",
      rawId: textToBuffer("credential-raw-id"),
      type: "public-key" as const,
      response: {
        clientDataJSON: textToBuffer("{}"),
        authenticatorData: textToBuffer("auth-data"),
        signature: textToBuffer("signature"),
        userHandle: null,
      },
    } as unknown as PublicKeyCredential

    const serialized = passkeyAssertionSerialize(fakeCredential)

    expect(serialized.response.userHandle).toBeUndefined()
  })
})
