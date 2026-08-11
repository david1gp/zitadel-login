import * as v from "valibot"

import type { Result } from "../../result/Result"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import { passkeyOptionsSchema, type PasskeyOptions } from "./passkeyOptionsSchema"

export function passkeyOptionsParse(raw: unknown): Result<PasskeyOptions> {
  const op = "passkeyOptionsParse"
  if (typeof raw !== "object" || raw === null) {
    return resultErrorCreate(op, "Invalid passkey options structure", raw)
  }
  const candidate = "publicKey" in raw ? raw : { publicKey: raw }
  const parsed = v.safeParse(passkeyOptionsSchema, candidate)
  if (parsed.success) {
    return resultCreate(parsed.output)
  }
  return resultErrorCreate(op, "Invalid passkey options payload", raw)
}
