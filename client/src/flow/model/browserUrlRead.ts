import type { Result } from "../../result/Result"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"

export function browserUrlRead(browserWindow: Window): Result<URL> {
  const op = "browserUrlRead"
  try {
    return resultCreate(new URL(browserWindow.location.href))
  } catch (error) {
    return resultErrorCreate(op, "Could not read current browser URL.", error)
  }
}
