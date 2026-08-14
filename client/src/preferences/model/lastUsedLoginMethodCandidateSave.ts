import type { Result } from "../../result/Result"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import { lastUsedLoginMethodCandidateKey } from "./lastUsedLoginMethodCandidateKey"
import type { LastUsedLoginMethodPrimary } from "./lastUsedLoginMethodPrimarySchema"

export function lastUsedLoginMethodCandidateSave(
  storage: Storage | undefined,
  flowHandle: string,
  organizationId: string,
  primary: LastUsedLoginMethodPrimary,
): Result<undefined> {
  const op = "lastUsedLoginMethodCandidateSave"
  if (!storage) return resultCreate(undefined)
  const candidate = { version: 1 as const, organizationId, primary }
  try {
    storage.setItem(lastUsedLoginMethodCandidateKey(flowHandle), JSON.stringify(candidate))
  } catch (error) {
    return resultErrorCreate(op, "Last-used login method candidate could not be saved.", error)
  }
  return resultCreate(undefined)
}
