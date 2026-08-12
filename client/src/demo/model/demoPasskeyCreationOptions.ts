import type { PasskeyCreationOptions } from "../../passkey/model/passkeyCreationOptionsSchema"

export const demoPasskeyCreationOptions: PasskeyCreationOptions = {
  publicKey: {
    attestation: "none",
    authenticatorSelection: { userVerification: "preferred" },
    challenge: "dGVzdGNoYWxsZW5nZQ",
    pubKeyCredParams: [{ alg: -7, type: "public-key" }],
    rp: { id: "localhost", name: "Demo Org" },
    timeout: 60000,
    user: {
      displayName: "Ada Lovelace",
      id: "YWRh",
      name: "ada@example.com",
    },
  },
}
