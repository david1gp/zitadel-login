import * as v from "valibot"

import { cookieCrypto } from "../../crypto/cookieCrypto"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import { flowV2CookieSchema } from "../model/flowV2CookieSchema"
import { flowV2CookieNameCreate } from "./flowV2CookieNameCreate"

const encodedValueSchema = v.pipe(v.string(), v.minLength(40), v.maxLength(3800), v.regex(/^[A-Za-z0-9_-]+$/))

export async function flowV2CookieOpen(value: string, flowHandle: string, keyValues: string[], now: number) {
  const op = "flowV2CookieOpen"
  const encoded = v.safeParse(encodedValueSchema, value)
  if (!encoded.success || keyValues.length === 0 || keyValues.length > 2) return resultErrorCreate(op, "flow_invalid")

  let bytes: Uint8Array
  try {
    bytes = cookieCrypto.decode(encoded.output)
  } catch {
    return resultErrorCreate(op, "flow_invalid")
  }
  if (bytes.byteLength <= 28) return resultErrorCreate(op, "flow_invalid")

  for (const keyValue of keyValues) {
    try {
      const decrypted = await cookieCrypto.decrypt(
        bytes,
        keyValue,
        cookieCrypto.encodeText(`${flowV2CookieNameCreate(flowHandle)}:schema-2`),
      )
      const parsed = v.safeParse(flowV2CookieSchema, JSON.parse(cookieCrypto.decodeText(new Uint8Array(decrypted))))
      if (!parsed.success || parsed.output.flowHandle !== flowHandle || parsed.output.issuedAt > now + 60) {
        return resultErrorCreate(op, "flow_invalid")
      }
      if (parsed.output.expiresAt <= now) return resultErrorCreate(op, "flow_expired")
      return resultCreate(parsed.output)
    } catch {
      // The immediately previous key is allowed to decrypt during rotation.
    }
  }
  return resultErrorCreate(op, "flow_invalid")
}
