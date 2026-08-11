import type { Result } from "../../result/Result"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import type { LoginPreference } from "./loginPreferenceSchema"

export function loginPreferenceSave(
  storage: Storage,
  organizationId: string,
  preference: LoginPreference,
): Result<undefined> {
  const op = "loginPreferenceSave"
  try {
    storage.setItem(`zitadel-login:preference:v1:${organizationId}`, JSON.stringify(preference))
  } catch (error) {
    return resultErrorCreate(op, "Login preferences could not be saved.", error)
  }
  return resultCreate(undefined)
}
