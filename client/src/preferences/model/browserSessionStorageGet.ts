import type { Result } from "../../result/Result"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"

export function browserSessionStorageGet(browserWindow: Window): Result<Storage | undefined> {
  const op = "browserSessionStorageGet"
  try {
    return resultCreate(browserWindow.sessionStorage)
  } catch (error) {
    return resultErrorCreate(op, "Browser session storage is unavailable.", error)
  }
}
