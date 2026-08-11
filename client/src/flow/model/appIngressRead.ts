import * as v from "valibot"

import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"

const authRequestSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(200), v.regex(/^[A-Za-z0-9._~-]+$/))

export function appIngressRead(url: URL) {
  const op = "appIngressRead"
  const allowedKeys = new Set(["authRequest", "flow", "dialog", "q"])
  const keys = [...url.searchParams.keys()]
  if (keys.some((key) => !allowedKeys.has(key)) || url.searchParams.getAll("authRequest").length > 1) {
    return resultErrorCreate(op, "The sign-in link contains unsupported state.")
  }
  const value = url.searchParams.get("authRequest")
  if (value === null) return resultCreate(undefined)
  const parsed = v.safeParse(authRequestSchema, value)
  if (!parsed.success) return resultErrorCreate(op, "The sign-in link is invalid.")
  return resultCreate(parsed.output)
}
