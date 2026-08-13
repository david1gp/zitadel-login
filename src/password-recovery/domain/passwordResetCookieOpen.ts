import * as v from "valibot"

import { cookieCrypto } from "../../crypto/cookieCrypto"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import { passwordResetCookieName } from "../model/passwordResetCookieName"
import { passwordResetCookieSchema } from "../model/passwordResetCookieSchema"

const encodedValueSchema = v.pipe(v.string(), v.minLength(40), v.maxLength(1024), v.regex(/^[A-Za-z0-9_-]+$/))

export async function passwordResetCookieOpen(value: string, keyValues: string[], now: number, transitions: number[]) {
  const op = "passwordResetCookieOpen"
  const encoded = v.safeParse(encodedValueSchema, value)
  if (
    !encoded.success ||
    keyValues.length === 0 ||
    keyValues.length > 2 ||
    transitions.length === 0 ||
    transitions.length > 2 ||
    transitions.some((transition) => transition !== 0 && transition !== 1)
  ) {
    return resultErrorCreate(op, "password_reset_link_invalid")
  }

  let bytes: Uint8Array
  try {
    bytes = cookieCrypto.decode(encoded.output)
  } catch {
    return resultErrorCreate(op, "password_reset_link_invalid")
  }
  if (bytes.byteLength <= 28) return resultErrorCreate(op, "password_reset_link_invalid")

  for (const keyValue of keyValues) {
    try {
      const decrypted = await cookieCrypto.decrypt(
        bytes,
        keyValue,
        cookieCrypto.encodeText(`${passwordResetCookieName}:schema-1`),
      )
      const parsed = v.safeParse(
        passwordResetCookieSchema,
        JSON.parse(cookieCrypto.decodeText(new Uint8Array(decrypted))),
      )
      if (!parsed.success || parsed.output.issuedAt > now + 60 || parsed.output.expiresAt <= now) {
        return resultErrorCreate(op, "password_reset_link_invalid")
      }
      if (!transitions.includes(parsed.output.transition)) {
        return resultErrorCreate(op, "password_reset_link_invalid")
      }
      return resultCreate(parsed.output)
    } catch {
      // The immediately previous key is allowed to decrypt during rotation.
    }
  }
  return resultErrorCreate(op, "password_reset_link_invalid")
}
