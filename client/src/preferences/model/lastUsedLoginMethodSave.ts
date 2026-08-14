import type { Result } from "../../result/Result"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import type { LastUsedLoginMethod } from "./lastUsedLoginMethodSchema"

export function lastUsedLoginMethodSave(
  storage: Storage | undefined,
  organizationId: string,
  methods: LastUsedLoginMethod,
): Result<undefined> {
  const op = "lastUsedLoginMethodSave"
  if (!storage) return resultCreate(undefined)
  try {
    storage.setItem(`zitadel-login:last-used-method:v1:${organizationId}`, JSON.stringify(methods))
  } catch (error) {
    return resultErrorCreate(op, "Last-used login methods could not be saved.", error)
  }
  return resultCreate(undefined)
}
