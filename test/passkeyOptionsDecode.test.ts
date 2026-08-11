import { describe, expect, test } from "bun:test"

import { passkeyOptionsDecode } from "../client/src/passkey/model/passkeyOptionsDecode"
import type { PasskeyOptions } from "../client/src/passkey/model/passkeyOptionsSchema"

describe("passkeyOptionsDecode", () => {
  test("decodes base64url challenge and allowCredentials ids to Uint8Array buffers", () => {
    const rawOptions: PasskeyOptions = {
      publicKey: {
        challenge: "GAOHYz2jE69kJMYo6Laij8yWw9-dKKgbViNhfuy0StA",
        rpId: "login.example",
        timeout: 300000,
        userVerification: "required",
        allowCredentials: [
          {
            id: "ATmqBg-99qyOZk2zloPdJQyS2R7IkFT7v9Hoos_B_nM",
            type: "public-key",
            transports: ["internal", "hybrid"],
          },
        ],
      },
    }

    const decoded = passkeyOptionsDecode(rawOptions)

    expect(decoded.rpId).toBe("login.example")
    expect(decoded.timeout).toBe(300000)
    expect(decoded.userVerification).toBe("required")
    expect(decoded.challenge).toBeInstanceOf(Uint8Array)
    expect((decoded.challenge as Uint8Array).byteLength).toBe(32)

    expect(decoded.allowCredentials).toHaveLength(1)
    const cred = decoded.allowCredentials![0]!
    expect(cred.type).toBe("public-key")
    expect(cred.id).toBeInstanceOf(Uint8Array)
    expect((cred.id as Uint8Array).byteLength).toBe(32)
    expect(cred.transports).toEqual(["internal", "hybrid"])
  })
})
