import * as v from "valibot"

import { cookieCrypto } from "../../crypto/cookieCrypto"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import { type RecentAccountCookie, recentAccountCookieSchema } from "../model/recentAccountCookieSchema"

const cookieName = "__Host-zitadel-login-accounts"
const encodedValueSchema = v.pipe(v.string(), v.minLength(40), v.maxLength(3800), v.regex(/^[A-Za-z0-9_-]+$/))
const maximumPlaintextBytes = 2800

export async function recentAccountCookieSeal(cookie: RecentAccountCookie, keyValue: string, iv: Uint8Array) {
  const op = "recentAccountCookieSeal"
  const parsed = v.safeParse(recentAccountCookieSchema, cookie)
  if (!parsed.success || iv.byteLength !== 12) return resultErrorCreate(op, "recent_account_unavailable")

  try {
    const plaintext = cookieCrypto.encodeText(JSON.stringify(parsed.output))
    if (plaintext.byteLength > maximumPlaintextBytes) return resultErrorCreate(op, "recent_account_unavailable")
    const encoded = await cookieCrypto.encrypt(
      plaintext,
      keyValue,
      iv,
      cookieCrypto.encodeText(`${cookieName}:schema-1`),
    )
    if (!v.safeParse(encodedValueSchema, encoded).success) return resultErrorCreate(op, "recent_account_unavailable")
    return resultCreate(encoded)
  } catch {
    return resultErrorCreate(op, "recent_account_unavailable")
  }
}
