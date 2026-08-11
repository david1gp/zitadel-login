import type { PasskeyOptions } from "./passkeyOptionsSchema"

function base64UrlToBuffer(base64url: string): Uint8Array {
  const base64 = base64url.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (base64url.length % 4)) % 4)
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    const code = binary.charCodeAt(index)
    bytes[index] = code
  }
  return bytes
}

export function passkeyOptionsDecode(options: PasskeyOptions): PublicKeyCredentialRequestOptions {
  return {
    challenge: base64UrlToBuffer(options.publicKey.challenge) as BufferSource,
    rpId: options.publicKey.rpId,
    ...(options.publicKey.timeout !== undefined ? { timeout: options.publicKey.timeout } : {}),
    ...(options.publicKey.userVerification ? { userVerification: options.publicKey.userVerification } : {}),
    ...(options.publicKey.allowCredentials
      ? {
          allowCredentials: options.publicKey.allowCredentials.map((credential) => ({
            id: base64UrlToBuffer(credential.id) as BufferSource,
            type: credential.type,
            ...(credential.transports ? { transports: credential.transports as AuthenticatorTransport[] } : {}),
          })),
        }
      : {}),
  }
}
