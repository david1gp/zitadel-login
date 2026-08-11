import type { Result } from "../../result/Result"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import type { ThemePreference } from "./themePreferenceSchema"

export function themePreferenceSave(storage: Storage, preference: ThemePreference): Result<undefined> {
  const op = "themePreferenceSave"
  try {
    storage.setItem("zitadel-login:theme:v1", JSON.stringify(preference))
  } catch (error) {
    return resultErrorCreate(op, "Theme preference could not be saved.", error)
  }
  return resultCreate(undefined)
}
