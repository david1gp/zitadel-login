import * as v from "valibot"

import type { Result } from "../../result/Result"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import { type LoginPreference, loginPreferenceSchema } from "./loginPreferenceSchema"

export function loginPreferenceLoad(storage: Storage, organizationId: string): Result<LoginPreference | undefined> {
  const op = "loginPreferenceLoad"
  const key = `zitadel-login:preference:v1:${organizationId}`
  let stored: string | null
  try {
    stored = storage.getItem(key)
  } catch (error) {
    return resultErrorCreate(op, "Login preferences are unavailable.", error)
  }
  if (stored === null) return resultCreate(undefined)
  let input: unknown
  try {
    input = JSON.parse(stored)
  } catch (error) {
    try {
      storage.removeItem(key)
    } catch {}
    return resultErrorCreate(op, "Stored login preferences are invalid.", error)
  }
  const parsed = v.safeParse(loginPreferenceSchema, input)
  if (!parsed.success) {
    try {
      storage.removeItem(key)
    } catch {}
    return resultErrorCreate(op, "Stored login preferences are invalid.", input)
  }
  const identifierExpired =
    parsed.output.identifier !== undefined && Date.now() - parsed.output.updatedAt > 180 * 24 * 60 * 60 * 1000
  if (identifierExpired) {
    const { identifier: _, ...preference } = parsed.output
    const cleaned = { ...preference, updatedAt: Date.now() }
    try {
      storage.setItem(key, JSON.stringify(cleaned))
    } catch {}
    return resultCreate(cleaned)
  }
  return resultCreate(parsed.output)
}
