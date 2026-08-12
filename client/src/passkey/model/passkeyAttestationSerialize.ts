import * as v from "valibot"

import type { Result } from "../../result/Result"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import { type PasskeyAttestation, passkeyAttestationSchema } from "./passkeyAttestationSchema"

function bufferToBase64Url(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  let binary = ""
  for (let index = 0; index < bytes.byteLength; index += 1) {
    binary += String.fromCharCode(bytes[index] ?? 0)
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
}

export function passkeyAttestationSerialize(credential: PublicKeyCredential): Result<PasskeyAttestation> {
  const op = "passkeyAttestationSerialize"
  const response = credential.response as AuthenticatorAttestationResponse | undefined
  if (!response || !response.attestationObject || !response.clientDataJSON || !credential.rawId) {
    return resultErrorCreate(op, "Failed to process the security key registration response.")
  }

  let candidate: unknown
  try {
    const rawId = bufferToBase64Url(credential.rawId)
    candidate = {
      id: credential.id || rawId,
      rawId,
      type: "public-key",
      response: {
        attestationObject: bufferToBase64Url(response.attestationObject),
        clientDataJSON: bufferToBase64Url(response.clientDataJSON),
      },
    }
  } catch {
    return resultErrorCreate(op, "Failed to process the security key registration response.")
  }

  const parsed = v.safeParse(passkeyAttestationSchema, candidate)
  if (!parsed.success) {
    return resultErrorCreate(op, "Failed to process the security key registration response.")
  }
  return resultCreate(parsed.output)
}
