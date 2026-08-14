import { describe, expect, test } from "bun:test"

import { languageBrowserPreferenceGet } from "../client/src/i18n/model/languageBrowserPreferenceGet"
import { languagePreferenceKey } from "../client/src/i18n/model/languagePreferenceKey"
import { languagePreferenceLoad } from "../client/src/i18n/model/languagePreferenceLoad"
import { languagePreferenceSave } from "../client/src/i18n/model/languagePreferenceSave"
import { languageResolve } from "../client/src/i18n/model/languageResolve"
import { languagesSupported } from "../client/src/i18n/model/languagesSupported"
import { translationCsvParse } from "../client/src/i18n/model/translationCsvParse"

function storageCreate(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial))
  return {
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  }
}

describe("language resolution", () => {
  test("uses the first supported browser language", () => {
    expect(languageBrowserPreferenceGet(["de-CH", "en-US"])).toBe("de")
    expect(languageBrowserPreferenceGet(["zh-Hant-TW", "en-US"])).toBe("zh")
    expect(languageBrowserPreferenceGet(["ar"])).toBe("ar")
  })

  test("defines all supported languages with native labels and Arabic direction", () => {
    expect(languagesSupported.map((option) => option.code)).toEqual([
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
    expect(languagesSupported.map((option) => option.nativeName)).toEqual([
      "English",
      "Deutsch",
      "Italiano",
      "Español",
      "Français",
      "Nederlands",
      "Polski",
      "Português",
      "简体中文",
      "Русский",
      "Magyar",
      "Türkçe",
      "日本語",
      "Українська",
      "العربية",
    ])
    expect(languagesSupported.find((option) => option.code === "ar")).toEqual({
      code: "ar",
      nativeName: "العربية",
      dir: "rtl",
    })
  })

  test("falls back to english for unsupported languages", () => {
    expect(languageBrowserPreferenceGet(["kl-GL", "xx"])).toBe("en")
    expect(languageBrowserPreferenceGet([])).toBe("en")
  })

  test("persists and prefers an explicit selection over the browser language", () => {
    const storage = storageCreate()
    expect(languagePreferenceSave(storage, "de").success).toBe(true)
    expect(storage.getItem(languagePreferenceKey)).toBe("de")
    expect(languagePreferenceLoad(storage)).toEqual({ success: true, data: "de" })
    expect(languageResolve(storage, ["en-US"])).toBe("de")
  })

  test("falls back to the browser language when storage access fails", () => {
    const storage = storageCreate()
    storage.getItem = () => {
      throw new Error("blocked")
    }
    expect(languageResolve(storage, ["de-CH"])).toBe("de")

    storage.setItem = () => {
      throw new Error("blocked")
    }
    expect(languagePreferenceSave(storage, "de").success).toBe(false)
  })

  test("discards a malformed stored language", () => {
    const storage = storageCreate({ [languagePreferenceKey]: "klingon" })
    expect(languagePreferenceLoad(storage).success).toBe(false)
    expect(storage.getItem(languagePreferenceKey)).toBeNull()
    expect(languageResolve(storage, ["de"])).toBe("de")
  })
})

describe("translation csv parsing", () => {
  test("parses quoted fields, skips empty translations and requires the english header", () => {
    const parsed = translationCsvParse(
      'english,de\r\n"By continuing, you acknowledge the",Mit dem\nSign in,Anmelden\nHide,\n\n',
    )
    expect(parsed).toEqual({
      success: true,
      data: { "By continuing, you acknowledge the": "Mit dem", "Sign in": "Anmelden" },
    })
    expect(translationCsvParse("key,de\na,b").success).toBe(false)
  })

  test("rejects malformed CSV instead of returning a partial dictionary", () => {
    expect(translationCsvParse('english,de\n"Language,Deutsch\n').success).toBe(false)
    expect(translationCsvParse('english,de\nLanguage"broken,Deutsch').success).toBe(false)
    expect(translationCsvParse("english,de,extra\nLanguage,Deutsch").success).toBe(false)
  })
})
