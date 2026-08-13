import * as v from "valibot"

import { cookieCrypto } from "../../crypto/cookieCrypto"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import { passwordRecoveryCookieName } from "../model/passwordRecoveryCookieName"
import { type PasswordRecoveryCookie, passwordRecoveryCookieSchema } from "../model/passwordRecoveryCookieSchema"

const encodedValueSchema = v.pipe(v.string(), v.minLength(40), v.maxLength(1024), v.regex(/^[A-Za-z0-9_-]+$/))

export async function passwordRecoveryCookieSeal(state: PasswordRecoveryCookie, keyValue: string, iv: Uint8Array) {
  const op = "passwordRecoveryCookieSeal"
  const parsed = v.safeParse(passwordRecoveryCookieSchema, state)
  if (!parsed.success || iv.byteLength !== 12) return resultErrorCreate(op, "recovery_state_unavailable")

  try {
    const encoded = await cookieCrypto.encrypt(
      cookieCrypto.encodeText(JSON.stringify(parsed.output)),
      keyValue,
      iv,
      cookieCrypto.encodeText(`${passwordRecoveryCookieName}:schema-1`),
    )
    if (!v.safeParse(encodedValueSchema, encoded).success) {
      return resultErrorCreate(op, "recovery_state_unavailable")
    }
    return resultCreate(encoded)
  } catch {
    return resultErrorCreate(op, "recovery_state_unavailable")
  }
}
