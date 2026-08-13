import * as v from "valibot"

import { cookieCrypto } from "../../crypto/cookieCrypto"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import { recentAccountCookieSchema } from "../model/recentAccountCookieSchema"

const cookieName = "__Host-zitadel-login-accounts"
const encodedValueSchema = v.pipe(v.string(), v.minLength(40), v.maxLength(3800), v.regex(/^[A-Za-z0-9_-]+$/))

export async function recentAccountCookieOpen(value: string, keyValues: string[], now: number) {
  const op = "recentAccountCookieOpen"
  const encoded = v.safeParse(encodedValueSchema, value)
  if (!encoded.success || keyValues.length === 0 || keyValues.length > 2)
    return resultErrorCreate(op, "recent_account_invalid")

  let bytes: Uint8Array
  try {
    bytes = cookieCrypto.decode(encoded.output)
  } catch {
    return resultErrorCreate(op, "recent_account_invalid")
  }
  if (bytes.byteLength <= 28) return resultErrorCreate(op, "recent_account_invalid")

  for (const keyValue of keyValues) {
    try {
      const decrypted = await cookieCrypto.decrypt(bytes, keyValue, cookieCrypto.encodeText(`${cookieName}:schema-1`))
      const parsed = v.safeParse(
        recentAccountCookieSchema,
        JSON.parse(cookieCrypto.decodeText(new Uint8Array(decrypted))),
      )
      if (!parsed.success) return resultErrorCreate(op, "recent_account_invalid")
      if (parsed.output.issuedAt > now + 60) return resultErrorCreate(op, "recent_account_invalid")
      if (parsed.output.expiresAt <= now) return resultErrorCreate(op, "recent_account_expired")
      return resultCreate(parsed.output)
    } catch {
      // The immediately previous key is allowed to decrypt during rotation.
    }
  }
  return resultErrorCreate(op, "recent_account_invalid")
}
