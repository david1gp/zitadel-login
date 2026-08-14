import * as v from "valibot"

import { type Language, languageSchema } from "./languageSchema"

/** Maps a BCP 47 tag such as `de-CH` to a supported language code, or `undefined`. */
export function languageFromTagGet(tag: string): Language | undefined {
  const primary = tag.trim().toLowerCase().split("-")[0]
  if (!primary) return undefined
  const parsed = v.safeParse(languageSchema, primary)
  if (!parsed.success) return undefined
  return parsed.output
}
