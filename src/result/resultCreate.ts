import type { Result } from "./Result"

export function resultCreate<T>(data: T): Result<T> {
  return { success: true, data }
}
