import * as v from "valibot"

import { cookieCrypto } from "../crypto/cookieCrypto"
import { resultCreate } from "../result/resultCreate"
import { resultErrorCreate } from "../result/resultErrorCreate"
import { flowCookieSchema } from "./flowCookieSchema"

const additionalData = cookieCrypto.encodeText("__Host-zitadel-login-flow:v1")

export async function flowCookieOpen(value: string, keyValue: string, now: number) {
  const op = "flowCookieOpen"
  try {
    const bytes = cookieCrypto.decode(value)
    if (bytes.length <= 28) return resultErrorCreate(op, "Invalid flow state")

    const decrypted = await cookieCrypto.decrypt(bytes, keyValue, additionalData)
    const parsed = v.safeParse(flowCookieSchema, JSON.parse(cookieCrypto.decodeText(new Uint8Array(decrypted))))
    if (!parsed.success || parsed.output.expiresAt <= now || parsed.output.issuedAt > now + 60) {
      return resultErrorCreate(op, "Invalid or expired flow state")
    }
    return resultCreate(parsed.output)
  } catch {
    return resultErrorCreate(op, "Invalid flow state")
  }
}
