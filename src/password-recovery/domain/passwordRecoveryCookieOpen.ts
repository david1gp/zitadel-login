import * as v from "valibot"

import { cookieCrypto } from "../../crypto/cookieCrypto"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import { passwordRecoveryCookieName } from "../model/passwordRecoveryCookieName"
import { passwordRecoveryCookieSchema } from "../model/passwordRecoveryCookieSchema"

const encodedValueSchema = v.pipe(v.string(), v.minLength(40), v.maxLength(1024), v.regex(/^[A-Za-z0-9_-]+$/))

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
    bytes = cookieCrypto.decode(encoded.output)
  } catch {
    return resultErrorCreate(op, "recovery_state_invalid")
  }
  if (bytes.byteLength <= 28) return resultErrorCreate(op, "recovery_state_invalid")

  for (const keyValue of keyValues) {
    try {
      const decrypted = await cookieCrypto.decrypt(
        bytes,
        keyValue,
        cookieCrypto.encodeText(`${passwordRecoveryCookieName}:schema-1`),
      )
      const parsed = v.safeParse(
        passwordRecoveryCookieSchema,
        JSON.parse(cookieCrypto.decodeText(new Uint8Array(decrypted))),
      )
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
