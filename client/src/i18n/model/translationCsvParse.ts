import type { Result } from "../../result/Result"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"

function rowsParse(csv: string): Result<string[][]> {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  let afterQuote = false
  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index]
    if (quoted) {
      if (char === '"') {
        if (csv[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          quoted = false
          afterQuote = true
        }
      } else {
        field += char
      }
      continue
    }
    if (afterQuote) {
      if (char === ",") {
        row.push(field)
        field = ""
        afterQuote = false
        continue
      }
      if (char === "\r" || char === "\n") {
        row.push(field)
        rows.push(row)
        row = []
        field = ""
        afterQuote = false
        if (char === "\r" && csv[index + 1] === "\n") index += 1
        continue
      }
      return resultErrorCreate("translationCsvParse", "Translation file contains malformed CSV.", csv)
    }
    if (char === '"') {
      if (field !== "") return resultErrorCreate("translationCsvParse", "Translation file contains malformed CSV.", csv)
      quoted = true
      continue
    }
    if (char === ",") {
      row.push(field)
      field = ""
      continue
    }
    if (char === "\r" || char === "\n") {
      row.push(field)
      rows.push(row)
      row = []
      field = ""
      if (char === "\r" && csv[index + 1] === "\n") index += 1
      continue
    }
    field += char
  }
  if (quoted) return resultErrorCreate("translationCsvParse", "Translation file contains malformed CSV.", csv)
  if (afterQuote || row.length > 0 || field !== "") {
    row.push(field)
    rows.push(row)
  }
  return resultCreate(rows.filter((entry) => entry.some((value) => value.trim() !== "")))
}

/** Parses an `english,{lang}` CSV into a translation dictionary. */
export function translationCsvParse(csv: string): Result<Record<string, string>> {
  const op = "translationCsvParse"
  const parsedRows = rowsParse(csv)
  if (!parsedRows.success) return parsedRows
  const rows = parsedRows.data
  const header = rows[0]
  if (!header || header.length !== 2 || header[0]?.trim().toLowerCase() !== "english") {
    return resultErrorCreate(op, "Translation file header must start with an english column.", header)
  }
  const dictionary: Record<string, string> = {}
  for (const entry of rows.slice(1)) {
    if (entry.length > 2) return resultErrorCreate(op, "Translation file contains too many columns.", entry)
    const english = entry[0]
    const translated = entry[1]
    if (!english || !translated || translated.trim() === "") continue
    dictionary[english] = translated
  }
  return resultCreate(dictionary)
}
