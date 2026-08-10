import type { Result } from "./Result"

export function resultErrorCreate(op: string, errorMessage: string, rawData?: unknown): Result<never> {
  return { success: false, op, errorMessage, ...(rawData === undefined ? {} : { rawData }) }
}
