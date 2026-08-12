import * as v from "valibot"

import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import { passwordRecoveryCookieName } from "../model/passwordRecoveryCookieName"
import { passwordRecoveryCookieSchema } from "../model/passwordRecoveryCookieSchema"

const decoder = new TextDecoder()
const encodedValueSchema = v.pipe(v.string(), v.minLength(40), v.maxLength(1024), v.regex(/^[A-Za-z0-9_-]+$/))

function base64UrlDecode(value: string): Uint8Array {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (value.length % 4)) % 4)
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
}

function bytesCopy(value: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(value.byteLength)
  copy.set(value)
  return copy
}

export async function passwordRecoveryCookieOpen(
  value: string,
  keyValues: string[],
  now: number,
  expectedTransition: number,
) {
  const op = "passwordRecoveryCookieOpen"
  const encoded = v.safeParse(encodedValueSchema, value)
  if (
    !encoded.success ||
    keyValues.length === 0 ||
    keyValues.length > 2 ||
    !Number.isInteger(expectedTransition) ||
    expectedTransition < 0 ||
    expectedTransition > 10
  ) {
    return resultErrorCreate(op, "recovery_state_invalid")
  }

  let bytes: Uint8Array
  try {
    bytes = base64UrlDecode(encoded.output)
  } catch {
    return resultErrorCreate(op, "recovery_state_invalid")
  }
  if (bytes.byteLength <= 28) return resultErrorCreate(op, "recovery_state_invalid")

  for (const keyValue of keyValues) {
    try {
      const key = await crypto.subtle.importKey("raw", bytesCopy(base64UrlDecode(keyValue)), "AES-GCM", false, [
        "decrypt",
      ])
      const decrypted = await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: bytesCopy(bytes.slice(0, 12)),
          additionalData: new TextEncoder().encode(`${passwordRecoveryCookieName}:schema-1`),
        },
        key,
        bytesCopy(bytes.slice(12)),
      )
      const parsed = v.safeParse(passwordRecoveryCookieSchema, JSON.parse(decoder.decode(decrypted)))
      if (!parsed.success || parsed.output.issuedAt > now + 60) {
        return resultErrorCreate(op, "recovery_state_invalid")
      }
      if (parsed.output.expiresAt <= now) return resultErrorCreate(op, "recovery_state_expired")
      if (parsed.output.transition !== expectedTransition) {
        return resultErrorCreate(op, "recovery_state_replayed")
      }
      return resultCreate(parsed.output)
    } catch {
      // The immediately previous key is allowed to decrypt during rotation.
    }
  }
  return resultErrorCreate(op, "recovery_state_invalid")
}
