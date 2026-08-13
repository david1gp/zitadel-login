import * as v from "valibot"

import type { Result } from "../result/Result"
import { resultCreate } from "../result/resultCreate"
import { resultErrorCreate } from "../result/resultErrorCreate"

export async function requestPayloadParse<T>(
  request: { header: (name: string) => string | undefined; text: () => Promise<string> },
  schema: v.GenericSchema<unknown, T>,
  options: {
    contentType?: "exact" | "prefix"
    maximumLength?: number
    operation?: string
  } = {},
): Promise<Result<T>> {
  const op = options.operation ?? "payloadParse"
  const maximumLength = options.maximumLength ?? 4096
  const contentType = request.header("content-type")
  const contentTypeMatches =
    options.contentType === "exact"
      ? contentType === "application/json"
      : contentType?.toLowerCase().startsWith("application/json")
  if (!contentTypeMatches) return resultErrorCreate(op, "unsupported_media_type")

  const length = Number(request.header("content-length") ?? "0")
  if (!Number.isFinite(length) || length > maximumLength) return resultErrorCreate(op, "invalid_payload")

  let text: string
  try {
    text = await request.text()
  } catch {
    return resultErrorCreate(op, "invalid_payload")
  }
  if (text.length > maximumLength) return resultErrorCreate(op, "invalid_payload")

  let input: unknown
  try {
    input = JSON.parse(text)
  } catch {
    return resultErrorCreate(op, "invalid_payload")
  }
  const parsed = v.safeParse(schema, input)
  if (!parsed.success) return resultErrorCreate(op, "invalid_payload")
  return resultCreate(parsed.output)
}
