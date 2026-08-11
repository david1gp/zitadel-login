import * as v from "valibot"

import type { Result } from "../../result/Result"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"

const handleSchema = v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{22}$/))

export function flowHandleRead(url: URL): Result<string | undefined> {
  const op = "flowHandleRead"
  const values = url.searchParams.getAll("flow")
  if (values.length === 0) return resultCreate(undefined)
  if (values.length > 1) return resultErrorCreate(op, "The sign-in link is invalid.")
  const parsed = v.safeParse(handleSchema, values[0])
  if (!parsed.success) return resultErrorCreate(op, "The sign-in link is invalid.")
  return resultCreate(parsed.output)
}
