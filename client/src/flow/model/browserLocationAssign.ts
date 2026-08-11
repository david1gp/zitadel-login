import type { Result } from "../../result/Result"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"

export function browserLocationAssign(browserWindow: Window, targetUrl: string): Result<undefined> {
  const op = "browserLocationAssign"
  try {
    browserWindow.location.assign(targetUrl)
    return resultCreate(undefined)
  } catch (error) {
    return resultErrorCreate(op, "Could not navigate to target URL.", error)
  }
}
