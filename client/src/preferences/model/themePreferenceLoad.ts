import * as v from "valibot"

import type { Result } from "../../result/Result"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import { themePreferenceSchema, type ThemePreference } from "./themePreferenceSchema"

export function themePreferenceLoad(storage: Storage): Result<ThemePreference | undefined> {
  const op = "themePreferenceLoad"
  const key = "zitadel-login:theme:v1"
  let stored: string | null
  try {
    stored = storage.getItem(key)
  } catch (error) {
    return resultErrorCreate(op, "Theme preference is unavailable.", error)
  }
  if (stored === null) return resultCreate(undefined)
  let input: unknown
  try {
    input = JSON.parse(stored)
  } catch (error) {
    try {
      storage.removeItem(key)
    } catch {}
    return resultErrorCreate(op, "Stored theme preference is invalid.", error)
  }
  const parsed = v.safeParse(themePreferenceSchema, input)
  if (!parsed.success) {
    try {
      storage.removeItem(key)
    } catch {}
    return resultErrorCreate(op, "Stored theme preference is invalid.", input)
  }
  return resultCreate(parsed.output)
}
