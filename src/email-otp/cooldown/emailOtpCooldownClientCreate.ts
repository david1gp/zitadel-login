import * as v from "valibot"

import type { WorkerEmailOtpCooldown } from "../../config/workerBindingsSchema"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import { emailOtpCooldownObjectNameCreate } from "./emailOtpCooldownObjectNameCreate"
import type { EmailOtpCooldownPurpose } from "./emailOtpCooldownPurposeSchema"
import { emailOtpCooldownReserveResultSchema } from "./emailOtpCooldownReserveResultSchema"
import { emailOtpCooldownStatusSchema } from "./emailOtpCooldownStatusSchema"

type Input = {
  namespace: WorkerEmailOtpCooldown | undefined
  cookieKey: string
  purpose: EmailOtpCooldownPurpose
  identifier: string
}

function nowIsValid(now: number): boolean {
  return Number.isInteger(now) && now >= 0
}

export function emailOtpCooldownClientCreate(input: Input) {
  async function stubGet() {
    const op = "emailOtpCooldownStubGet"
    if (!input.namespace) return resultErrorCreate(op, "cooldown_unavailable")
    const name = await emailOtpCooldownObjectNameCreate(input.cookieKey, input.purpose, input.identifier)
    if (!name.success) return name
    try {
      return resultCreate(input.namespace.getByName(name.data))
    } catch {
      return resultErrorCreate(op, "cooldown_unavailable")
    }
  }

  return {
    async reserve(now: number) {
      const op = "emailOtpCooldownReserve"
      if (!nowIsValid(now)) return resultErrorCreate(op, "cooldown_unavailable")
      const stub = await stubGet()
      if (!stub.success) return stub
      try {
        const parsed = v.safeParse(emailOtpCooldownReserveResultSchema, await stub.data.reserve(now))
        if (!parsed.success) return resultErrorCreate(op, "cooldown_unavailable")
        return resultCreate(parsed.output)
      } catch {
        return resultErrorCreate(op, "cooldown_unavailable")
      }
    },
    async status(now: number) {
      const op = "emailOtpCooldownStatusGet"
      if (!nowIsValid(now)) return resultErrorCreate(op, "cooldown_unavailable")
      const stub = await stubGet()
      if (!stub.success) return stub
      try {
        const parsed = v.safeParse(emailOtpCooldownStatusSchema, await stub.data.status(now))
        if (!parsed.success) return resultErrorCreate(op, "cooldown_unavailable")
        return resultCreate(parsed.output)
      } catch {
        return resultErrorCreate(op, "cooldown_unavailable")
      }
    },
  }
}
