import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { demoBootstrap } from "../client/src/demo/model/demoBootstrap"
import { demoScenarios } from "../client/src/demo/model/demoScenarios"
import { loginMethodsGet } from "../client/src/flow/model/loginMethodsGet"
import { translationCsvParse } from "../client/src/i18n/model/translationCsvParse"
import { translationDynamicKeys } from "../client/src/i18n/model/translationDynamicKeys"
import { translationDictionaryLoad } from "../client/src/i18n/model/translationDictionaryLoad"
import { mfaFactorDetailGet } from "../client/src/mfa/model/mfaFactorDetailGet"
import { mfaFactorLabelGet } from "../client/src/mfa/model/mfaFactorLabelGet"

const sourceDirectory = fileURLToPath(new URL("../client/src/", import.meta.url))
const catalogDirectory = fileURLToPath(new URL("../client/public/i18n/", import.meta.url))
const expectedCatalogLanguages = [
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
] as const

function sourcePathsGet(directory: string): string[] {
  const paths: string[] = []
  for (const entry of readdirSync(directory)) {
    const path = `${directory}/${entry}`
    if (statSync(path).isDirectory()) {
      paths.push(...sourcePathsGet(path))
      continue
    }
    if (path.endsWith(".ts") || path.endsWith(".tsx")) paths.push(path)
  }
  return paths
}

function ttcArgumentsGet(source: string): string[] {
  const argumentsFound: string[] = []
  let from = 0
  while (true) {
    const start = source.indexOf("ttc(", from)
    if (start < 0) return argumentsFound
    let index = start + 4
    let depth = 1
    let quote = ""
    let escaped = false
    for (; index < source.length && depth > 0; index += 1) {
      const char = source[index]
      if (quote) {
        if (escaped) escaped = false
        else if (char === "\\") escaped = true
        else if (char === quote) quote = ""
        continue
      }
      if (char === '"' || char === "'" || char === "`") {
        quote = char
        continue
      }
      if (char === "(") depth += 1
      if (char === ")") depth -= 1
    }
    argumentsFound.push(source.slice(start + 4, index - 1))
    from = index
  }
}

function sourceTranslationKeysGet(): Set<string> {
  const keys = new Set<string>()
  for (const path of sourcePathsGet(sourceDirectory)) {
    for (const argument of ttcArgumentsGet(readFileSync(path, "utf8"))) {
      const direct = argument.match(/^\s*"((?:\\.|[^"\\])*)"\s*,?\s*$/)
      if (direct?.[1] !== undefined) keys.add(JSON.parse(`"${direct[1]}"`))
      for (const branch of argument.matchAll(/[?:]\s*"((?:\\.|[^"\\])*)"/g)) {
        if (branch[1] !== undefined) keys.add(JSON.parse(`"${branch[1]}"`))
      }
    }
  }
  return keys
}

function staticTranslationKeysGet(): Set<string> {
  const keys = sourceTranslationKeysGet()
  for (const scenario of demoScenarios) {
    keys.add(scenario.group)
    keys.add(scenario.label)
    keys.add(scenario.detail)
  }
  for (const method of loginMethodsGet(demoBootstrap)) {
    if (method.selection.method === "identity_provider") continue
    keys.add(method.label)
    if (method.detail) keys.add(method.detail)
  }
  for (const type of ["totp", "email_otp", "sms_otp", "u2f", "passkey"] as const) {
    keys.add(mfaFactorLabelGet(type))
    keys.add(mfaFactorDetailGet(type))
  }
  for (const value of ["Light", "Dark", "System"]) {
    keys.add(value)
    keys.add(`${value} theme`)
  }
  return keys
}

function csvRowsRead(csv: string): string[][] {
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
      } else if (char === "\r" || char === "\n") {
        row.push(field)
        rows.push(row)
        row = []
        field = ""
        afterQuote = false
        if (char === "\r" && csv[index + 1] === "\n") index += 1
      } else {
        throw new Error("Malformed CSV: characters after a quoted field")
      }
      continue
    }
    if (char === '"') {
      if (field !== "") throw new Error("Malformed CSV: quoted field did not start at a field boundary")
      quoted = true
    } else if (char === ",") {
      row.push(field)
      field = ""
    } else if (char === "\r" || char === "\n") {
      row.push(field)
      rows.push(row)
      row = []
      field = ""
      if (char === "\r" && csv[index + 1] === "\n") index += 1
    } else {
      field += char
    }
  }
  if (quoted) throw new Error("Malformed CSV: unterminated quoted field")
  if (afterQuote || row.length > 0 || field !== "") {
    row.push(field)
    rows.push(row)
  }
  return rows
}

function placeholdersGet(value: string): string[] {
  return [...value.matchAll(/\{[^{}]+\}/g)].map((match) => match[0]).sort()
}

function catalogCsvRead(path: string): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(path))
}

const staticTranslationKeys = staticTranslationKeysGet()
const dynamicTranslationKeys = new Set<string>(translationDynamicKeys)
const expectedTranslationKeys = new Set([...staticTranslationKeys, ...dynamicTranslationKeys])
const catalogEntries = readdirSync(catalogDirectory)

describe("translation catalogs", () => {
  const catalogPaths = catalogEntries
    .filter((entry) => entry.endsWith(".csv"))
    .map((entry) => `${catalogDirectory}/${entry}`)

  test("contain exactly the supported non-English locale files", () => {
    expect([...catalogEntries].sort()).toEqual(expectedCatalogLanguages.map((language) => `${language}.csv`).sort())
  })

  test("have a unique dynamic inventory disjoint from static keys", () => {
    expect(dynamicTranslationKeys.size).toBe(translationDynamicKeys.length)
    expect([...dynamicTranslationKeys].filter((key) => staticTranslationKeys.has(key))).toEqual([])
  })

  test("have exact complete coverage and valid CSV rows", () => {
    expect(catalogPaths.length).toBeGreaterThan(0)
    for (const path of catalogPaths) {
      const language = path.split("/").pop()?.replace(".csv", "")
      if (!language) throw new Error(`Could not determine language for ${path}`)
      const csv = catalogCsvRead(path)
      const parsed = translationCsvParse(csv)
      expect(parsed.success).toBe(true)
      const rows = csvRowsRead(csv)
      expect(rows[0]).toEqual(["english", language])
      expect(rows.slice(1).every((row) => row.length === 2)).toBe(true)

      const actualKeys = new Set<string>()
      for (const row of rows.slice(1)) {
        const [english, translated] = row
        expect(english?.trim()).toBe(english)
        expect(english).not.toBe("")
        expect(translated?.trim()).toBe(translated)
        expect(translated).not.toBe("")
        expect(actualKeys.has(english)).toBe(false)
        actualKeys.add(english)
        expect(placeholdersGet(translated)).toEqual(placeholdersGet(english))
      }
      expect([...actualKeys].sort()).toEqual([...expectedTranslationKeys].sort())
    }
  })

  test("load through the runtime URL and CSV request", async () => {
    const originalFetch = globalThis.fetch
    let requestedLanguage = expectedCatalogLanguages[0]
    globalThis.fetch = async (input, init) => {
      expect(input).toBe(`/i18n/${requestedLanguage}.csv`)
      expect(init).toEqual({ headers: { accept: "text/csv" } })
      return new Response(catalogCsvRead(`${catalogDirectory}/${requestedLanguage}.csv`), {
        headers: { "content-type": "text/csv; charset=utf-8" },
      })
    }
    try {
      for (const language of expectedCatalogLanguages) {
        requestedLanguage = language
        const loaded = await translationDictionaryLoad(language)
        expect(loaded.success).toBe(true)
        if (loaded.success) expect(Object.keys(loaded.data).sort()).toEqual([...expectedTranslationKeys].sort())
      }
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
