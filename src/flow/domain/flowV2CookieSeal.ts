import { cookieCrypto } from "../../crypto/cookieCrypto"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import type { FlowV2Cookie } from "../model/flowV2CookieSchema"
import { flowV2CookieNameCreate } from "./flowV2CookieNameCreate"

export async function flowV2CookieSeal(state: FlowV2Cookie, keyValue: string, iv: Uint8Array) {
  const op = "flowV2CookieSeal"
  try {
    if (iv.byteLength !== 12) return resultErrorCreate(op, "flow_state_unavailable")
    return resultCreate(
      await cookieCrypto.encrypt(
        cookieCrypto.encodeText(JSON.stringify(state)),
        keyValue,
        iv,
        cookieCrypto.encodeText(`${flowV2CookieNameCreate(state.flowHandle)}:schema-2`),
      ),
    )
  } catch {
    return resultErrorCreate(op, "flow_state_unavailable")
  }
}
