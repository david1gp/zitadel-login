import * as v from "valibot"

import type { Result } from "../../result/Result"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import { lastUsedLoginMethodCandidateKey } from "./lastUsedLoginMethodCandidateKey"
import { lastUsedLoginMethodCandidateSchema } from "./lastUsedLoginMethodCandidateSchema"
import type { LastUsedLoginMethodPrimary } from "./lastUsedLoginMethodPrimarySchema"

export function lastUsedLoginMethodCandidateLoad(
  storage: Storage | undefined,
  flowHandle: string,
  organizationId: string,
): Result<LastUsedLoginMethodPrimary | undefined> {
  const op = "lastUsedLoginMethodCandidateLoad"
  if (!storage) return resultCreate(undefined)
  const key = lastUsedLoginMethodCandidateKey(flowHandle)
  let stored: string | null
  try {
    stored = storage.getItem(key)
  } catch (error) {
    return resultErrorCreate(op, "Last-used login method candidate is unavailable.", error)
  }
  if (stored === null) return resultCreate(undefined)

  let input: unknown
  try {
    input = JSON.parse(stored)
  } catch (error) {
    try {
      storage.removeItem(key)
    } catch {}
    return resultErrorCreate(op, "Stored last-used login method candidate is invalid.", error)
  }

  const parsed = v.safeParse(lastUsedLoginMethodCandidateSchema, input)
  if (!parsed.success) {
    try {
      storage.removeItem(key)
    } catch {}
    return resultErrorCreate(op, "Stored last-used login method candidate is invalid.", input)
  }
  if (parsed.output.organizationId !== organizationId) {
    try {
      storage.removeItem(key)
    } catch {}
    return resultCreate(undefined)
  }
  return resultCreate(parsed.output.primary)
}
