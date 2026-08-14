import type { Result } from "../../result/Result"
import { resultCreate } from "../../result/resultCreate"
import { lastUsedLoginMethodCandidateClear } from "./lastUsedLoginMethodCandidateClear"
import { lastUsedLoginMethodCandidateLoad } from "./lastUsedLoginMethodCandidateLoad"
import { lastUsedLoginMethodSave } from "./lastUsedLoginMethodSave"
import type { LastUsedLoginMethod } from "./lastUsedLoginMethodSchema"

export function lastUsedLoginMethodPromote(
  storage: Storage | undefined,
  sessionStorage: Storage | undefined,
  flowHandle: string,
  organizationId: string,
  methods: LastUsedLoginMethod,
): Result<LastUsedLoginMethod | undefined> {
  const candidate = lastUsedLoginMethodCandidateLoad(sessionStorage, flowHandle, organizationId)
  if (!candidate.success) return candidate
  if (!candidate.data) return resultCreate(undefined)

  const next = { ...methods, primary: candidate.data }
  const saved = lastUsedLoginMethodSave(storage, organizationId, next)
  if (!saved.success) return saved
  if (storage) lastUsedLoginMethodCandidateClear(sessionStorage, flowHandle)
  return resultCreate(next)
}
