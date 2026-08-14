import * as v from "valibot"

import type { Result } from "../../result/Result"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import { type LastUsedLoginMethod, lastUsedLoginMethodSchema } from "./lastUsedLoginMethodSchema"

export function lastUsedLoginMethodLoad(
  storage: Storage | undefined,
  organizationId: string,
): Result<LastUsedLoginMethod | undefined> {
  const op = "lastUsedLoginMethodLoad"
  if (!storage) return resultCreate(undefined)
  const key = `zitadel-login:last-used-method:v1:${organizationId}`
  let stored: string | null
  try {
    stored = storage.getItem(key)
  } catch (error) {
    return resultErrorCreate(op, "Last-used login methods are unavailable.", error)
  }
  if (stored === null) return resultCreate(undefined)
  let input: unknown
  try {
    input = JSON.parse(stored)
  } catch (error) {
    try {
      storage.removeItem(key)
    } catch {}
    return resultErrorCreate(op, "Stored last-used login methods are invalid.", error)
  }
  const parsed = v.safeParse(lastUsedLoginMethodSchema, input)
  if (!parsed.success) {
    try {
      storage.removeItem(key)
    } catch {}
    return resultErrorCreate(op, "Stored last-used login methods are invalid.", input)
  }
  return resultCreate(parsed.output)
}
