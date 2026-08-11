import type { Result } from "../../result/Result"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"

export function browserHistoryNavigate(browserWindow: Window, path: string, replace = false): Result<undefined> {
  const op = "browserHistoryNavigate"
  try {
    browserWindow.history[replace ? "replaceState" : "pushState"](null, "", path)
    return resultCreate(undefined)
  } catch (error) {
    return resultErrorCreate(op, "Could not update browser history.", error)
  }
}
