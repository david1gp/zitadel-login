import { browserStorageGet } from "../../preferences/model/browserStorageGet"
import { languageApply } from "./languageApply"
import { languagePreferenceSave } from "./languagePreferenceSave"
import type { Language } from "./languageSchema"

/** Persists an explicit user language choice and applies it. */
export async function languageSelect(browserWindow: Window, language: Language): Promise<void> {
  const storage = browserStorageGet(browserWindow)
  if (storage.success && storage.data) languagePreferenceSave(storage.data, language)
  await languageApply(language)
}
