import type { Language } from "./languageSchema"

export type LanguageOption = {
  code: Language
  nativeName: string
  dir: "ltr" | "rtl"
}

/** Official ZITADEL languages, labelled in their own language. */
export const languagesSupported: readonly LanguageOption[] = [
  { code: "en", nativeName: "English", dir: "ltr" },
  { code: "de", nativeName: "Deutsch", dir: "ltr" },
  { code: "it", nativeName: "Italiano", dir: "ltr" },
  { code: "es", nativeName: "Español", dir: "ltr" },
  { code: "fr", nativeName: "Français", dir: "ltr" },
  { code: "nl", nativeName: "Nederlands", dir: "ltr" },
  { code: "pl", nativeName: "Polski", dir: "ltr" },
  { code: "pt", nativeName: "Português", dir: "ltr" },
  { code: "zh", nativeName: "简体中文", dir: "ltr" },
  { code: "ru", nativeName: "Русский", dir: "ltr" },
  { code: "hu", nativeName: "Magyar", dir: "ltr" },
  { code: "tr", nativeName: "Türkçe", dir: "ltr" },
  { code: "ja", nativeName: "日本語", dir: "ltr" },
  { code: "uk", nativeName: "Українська", dir: "ltr" },
  { code: "ar", nativeName: "العربية", dir: "rtl" },
]
