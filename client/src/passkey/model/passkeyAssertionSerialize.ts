import type { PasskeyCredentialAssertion } from "./passkeyVerifyRequestSchema"

function bufferToBase64Url(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  let binary = ""
  for (let index = 0; index < bytes.byteLength; index += 1) {
    const code = bytes[index] ?? 0
    binary += String.fromCharCode(code)
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
}

export function passkeyAssertionSerialize(credential: PublicKeyCredential): PasskeyCredentialAssertion {
  const response = credential.response as AuthenticatorAssertionResponse
  let userHandle: string | null = null
  if (response.userHandle && response.userHandle.byteLength > 0) {
    userHandle = bufferToBase64Url(response.userHandle)
  }

  const rawIdStr = bufferToBase64Url(credential.rawId)
  const idStr = credential.id || rawIdStr

  return {
    id: idStr,
    rawId: rawIdStr,
    type: "public-key",
    response: {
      clientDataJSON: bufferToBase64Url(response.clientDataJSON),
      authenticatorData: bufferToBase64Url(response.authenticatorData),
      signature: bufferToBase64Url(response.signature),
      ...(userHandle !== null ? { userHandle } : {}),
    },
  }
}
