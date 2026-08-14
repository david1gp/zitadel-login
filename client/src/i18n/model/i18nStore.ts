import { createSignalObject } from "../../ui/createSignalObject"
import type { Language } from "./languageSchema"

/** Reactive i18n boundary state: the active language and its runtime dictionary. */
export const i18nStore = {
  language: createSignalObject<Language>("en"),
  dictionary: createSignalObject<Record<string, string>>({}),
}
