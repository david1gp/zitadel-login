import * as v from "valibot"

import type { Result } from "../../result/Result"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import { languagePreferenceKey } from "./languagePreferenceKey"
import { type Language, languageSchema } from "./languageSchema"

/** Reads the explicit language override, if any. */
export function languagePreferenceLoad(storage: Storage): Result<Language | undefined> {
  const op = "languagePreferenceLoad"
  let stored: string | null
  try {
    stored = storage.getItem(languagePreferenceKey)
  } catch (error) {
    return resultErrorCreate(op, "Language preference is unavailable.", error)
  }
  if (stored === null) return resultCreate(undefined)
  const parsed = v.safeParse(languageSchema, stored)
  if (!parsed.success) {
    try {
      storage.removeItem(languagePreferenceKey)
    } catch {}
    return resultErrorCreate(op, "Stored language preference is invalid.", stored)
  }
  return resultCreate(parsed.output)
}
