import type { Result } from "../../result/Result"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import { lastUsedLoginMethodCandidateKey } from "./lastUsedLoginMethodCandidateKey"

export function lastUsedLoginMethodCandidateClear(storage: Storage | undefined, flowHandle: string): Result<undefined> {
  const op = "lastUsedLoginMethodCandidateClear"
  if (!storage) return resultCreate(undefined)
  try {
    storage.removeItem(lastUsedLoginMethodCandidateKey(flowHandle))
  } catch (error) {
    return resultErrorCreate(op, "Last-used login method candidate could not be cleared.", error)
  }
  return resultCreate(undefined)
}
