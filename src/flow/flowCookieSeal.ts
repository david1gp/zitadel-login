import { cookieCrypto } from "../crypto/cookieCrypto"
import { resultCreate } from "../result/resultCreate"
import { resultErrorCreate } from "../result/resultErrorCreate"
import type { FlowCookie } from "./flowCookieSchema"

const additionalData = cookieCrypto.encodeText("__Host-zitadel-login-flow:v1")

export async function flowCookieSeal(cookie: FlowCookie, keyValue: string, iv: Uint8Array) {
  const op = "flowCookieSeal"
  try {
    return resultCreate(
      await cookieCrypto.encrypt(cookieCrypto.encodeText(JSON.stringify(cookie)), keyValue, iv, additionalData),
    )
  } catch {
    return resultErrorCreate(op, "Unable to protect flow state")
  }
}
