import type { Result } from "../../result/Result"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import { languagePreferenceKey } from "./languagePreferenceKey"
import type { Language } from "./languageSchema"

export function languagePreferenceSave(storage: Storage, language: Language): Result<undefined> {
  const op = "languagePreferenceSave"
  try {
    storage.setItem(languagePreferenceKey, language)
  } catch (error) {
    return resultErrorCreate(op, "Language preference could not be saved.", error)
  }
  return resultCreate(undefined)
}
