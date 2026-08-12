import * as v from "valibot"

import type { Result } from "../../result/Result"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import { type PasskeyCreationOptions, passkeyCreationOptionsSchema } from "./passkeyCreationOptionsSchema"

export function passkeyCreationOptionsParse(raw: unknown): Result<PasskeyCreationOptions> {
  const op = "passkeyCreationOptionsParse"
  if (typeof raw !== "object" || raw === null) {
    return resultErrorCreate(op, "Invalid passkey creation options structure")
  }
  const candidate = "publicKey" in raw ? raw : { publicKey: raw }
  const parsed = v.safeParse(passkeyCreationOptionsSchema, candidate)
  if (!parsed.success) return resultErrorCreate(op, "Invalid passkey creation options payload")
  return resultCreate(parsed.output)
}
