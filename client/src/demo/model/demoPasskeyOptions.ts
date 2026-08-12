import type { PasskeyOptions } from "../../passkey/model/passkeyOptionsSchema"

export const demoPasskeyOptions: PasskeyOptions = {
  publicKey: {
    challenge: "dGVzdGNoYWxsZW5nZQ",
    rpId: "localhost",
    timeout: 60000,
    userVerification: "preferred",
  },
}
