import type { Result } from "../../result/Result"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import type { Language } from "./languageSchema"
import { translationCsvParse } from "./translationCsvParse"

/** Fetches and parses `/i18n/{language}.csv`. English needs no dictionary. */
export async function translationDictionaryLoad(language: Language): Promise<Result<Record<string, string>>> {
  const op = "translationDictionaryLoad"
  if (language === "en") return resultCreate({})
  let response: Response
  try {
    response = await fetch(`/i18n/${language}.csv`, { headers: { accept: "text/csv" } })
  } catch (error) {
    return resultErrorCreate(op, "Translations could not be loaded.", error)
  }
  if (!response.ok) return resultErrorCreate(op, "Translations could not be loaded.", response.status)
  let csv: string
  try {
    csv = await response.text()
  } catch (error) {
    return resultErrorCreate(op, "Translations could not be read.", error)
  }
  return translationCsvParse(csv)
}
