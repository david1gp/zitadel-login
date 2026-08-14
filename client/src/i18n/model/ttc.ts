import { i18nStore } from "./i18nStore"

/** Translates English UI text reactively, falling back to the English text itself. */
export function ttc(englishText: string): string {
  if (i18nStore.language.get() === "en") return englishText
  return i18nStore.dictionary.get()[englishText] ?? englishText
}
