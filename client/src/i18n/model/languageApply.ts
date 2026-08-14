import { languagesSupported } from "./languagesSupported"
import { i18nStore } from "./i18nStore"
import type { Language } from "./languageSchema"
import { translationDictionaryLoad } from "./translationDictionaryLoad"

let requestSequence = 0

/** Loads a language and applies it once, ignoring results of superseded requests. */
export async function languageApply(language: Language): Promise<void> {
  const request = ++requestSequence
  const option = languagesSupported.find((entry) => entry.code === language)
  document.documentElement.lang = language
  document.documentElement.dir = option?.dir ?? "ltr"
  if (language === "en") {
    i18nStore.dictionary.set({})
    i18nStore.language.set("en")
    return
  }
  const loaded = await translationDictionaryLoad(language)
  if (request !== requestSequence) return
  i18nStore.dictionary.set(loaded.success ? loaded.data : {})
  i18nStore.language.set(language)
}
