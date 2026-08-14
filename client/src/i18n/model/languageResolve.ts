import { languageBrowserPreferenceGet } from "./languageBrowserPreferenceGet"
import { languagePreferenceLoad } from "./languagePreferenceLoad"
import type { Language } from "./languageSchema"

/** Explicit stored selection wins over the browser preference. */
export function languageResolve(storage: Storage | undefined, tags: readonly string[]): Language {
  if (storage) {
    const stored = languagePreferenceLoad(storage)
    if (stored.success && stored.data) return stored.data
  }
  return languageBrowserPreferenceGet(tags)
}
