import * as v from "valibot"

import { cookieCrypto } from "../../crypto/cookieCrypto"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import { passwordResetCookieName } from "../model/passwordResetCookieName"
import { type PasswordResetCookie, passwordResetCookieSchema } from "../model/passwordResetCookieSchema"

const encodedValueSchema = v.pipe(v.string(), v.minLength(40), v.maxLength(1024), v.regex(/^[A-Za-z0-9_-]+$/))

export async function passwordResetCookieSeal(state: PasswordResetCookie, keyValue: string, iv: Uint8Array) {
  const op = "passwordResetCookieSeal"
  const parsed = v.safeParse(passwordResetCookieSchema, state)
  if (!parsed.success || iv.byteLength !== 12) return resultErrorCreate(op, "password_reset_state_unavailable")

  try {
    const encoded = await cookieCrypto.encrypt(
      cookieCrypto.encodeText(JSON.stringify(parsed.output)),
      keyValue,
      iv,
      cookieCrypto.encodeText(`${passwordResetCookieName}:schema-1`),
    )
    if (!v.safeParse(encodedValueSchema, encoded).success) {
      return resultErrorCreate(op, "password_reset_state_unavailable")
    }
    return resultCreate(encoded)
  } catch {
    return resultErrorCreate(op, "password_reset_state_unavailable")
  }
}
