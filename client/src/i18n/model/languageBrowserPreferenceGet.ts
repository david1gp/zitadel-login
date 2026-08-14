import type { Language } from "./languageSchema"
import { languageFromTagGet } from "./languageFromTagGet"

/** First supported language among the browser preferences; English otherwise. */
export function languageBrowserPreferenceGet(tags: readonly string[]): Language {
  for (const tag of tags) {
    const language = languageFromTagGet(tag)
    if (language) return language
  }
  return "en"
}
