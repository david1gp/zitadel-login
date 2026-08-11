import type { Result } from "../../result/Result"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"

export function browserStorageGet(browserWindow: Window): Result<Storage | undefined> {
  const op = "browserStorageGet"
  try {
    return resultCreate(browserWindow.localStorage)
  } catch (error) {
    return resultErrorCreate(op, "Browser storage is unavailable.", error)
  }
}
