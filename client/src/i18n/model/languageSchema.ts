import * as v from "valibot"

export const languageSchema = v.picklist([
  "en",
  "de",
  "it",
  "es",
  "fr",
  "nl",
  "pl",
  "pt",
  "zh",
  "ru",
  "hu",
  "tr",
  "ja",
  "uk",
  "ar",
])

export type Language = v.InferOutput<typeof languageSchema>
