import * as v from "valibot"

import { resultCreate } from "../result/resultCreate"
import { resultErrorCreate } from "../result/resultErrorCreate"
import type { WorkerBindings, WorkerBindingsInput } from "./workerBindingsSchema"
import { workerBindingsSchema } from "./workerBindingsSchema"

export function workerBindingsParse(input: WorkerBindingsInput) {
  const op = "workerBindingsParse"
  const parsed = v.safeParse(workerBindingsSchema, input)
  if (!parsed.success) {
    return resultErrorCreate(op, v.summarize(parsed.issues))
  }

  const zitadelOrigin = new URL(parsed.output.ZITADEL_ORIGIN)
  const fallbackUrl = new URL(parsed.output.LOGIN_V2_FALLBACK_URL)
  if (fallbackUrl.origin !== zitadelOrigin.origin || fallbackUrl.username || fallbackUrl.password) {
    return resultErrorCreate(op, "LOGIN_V2_FALLBACK_URL must use ZITADEL_ORIGIN")
  }

  return resultCreate<WorkerBindings>(parsed.output)
}
