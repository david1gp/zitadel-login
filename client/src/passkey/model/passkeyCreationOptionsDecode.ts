import type { PasskeyCreationOptions } from "./passkeyCreationOptionsSchema"

function base64UrlToBuffer(base64url: string): Uint8Array {
  const base64 = base64url.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (base64url.length % 4)) % 4)
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

export function passkeyCreationOptionsDecode(options: PasskeyCreationOptions): PublicKeyCredentialCreationOptions {
  const publicKey = options.publicKey
  return {
    attestation: publicKey.attestation,
    authenticatorSelection: { userVerification: publicKey.authenticatorSelection.userVerification },
    challenge: base64UrlToBuffer(publicKey.challenge) as BufferSource,
    pubKeyCredParams: publicKey.pubKeyCredParams.map((parameters) => ({
      alg: parameters.alg,
      type: parameters.type,
    })),
    rp: { id: publicKey.rp.id, name: publicKey.rp.name },
    timeout: publicKey.timeout,
    user: {
      displayName: publicKey.user.displayName,
      id: base64UrlToBuffer(publicKey.user.id) as BufferSource,
      name: publicKey.user.name,
    },
    ...(publicKey.excludeCredentials
      ? {
          excludeCredentials: publicKey.excludeCredentials.map((credential) => ({
            id: base64UrlToBuffer(credential.id) as BufferSource,
            type: credential.type,
            ...(credential.transports ? { transports: credential.transports as AuthenticatorTransport[] } : {}),
          })),
        }
      : {}),
  }
}
