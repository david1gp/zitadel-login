import { describe, expect, test } from "bun:test"

import { mdiMonitor } from "@adaptive-ds/mdi/mdiMonitor.js"
import { mdiThemeLightDark } from "@adaptive-ds/mdi/mdiThemeLightDark.js"
import { mdiWeatherNight } from "@adaptive-ds/mdi/mdiWeatherNight.js"
import { mdiWhiteBalanceSunny } from "@adaptive-ds/mdi/mdiWhiteBalanceSunny.js"

import { themeIconPathGet } from "../client/src/preferences/model/themeIconPathGet"

describe("themeIconPathGet", () => {
  test("maps theme choices to MDI paths", () => {
    expect(themeIconPathGet("light")).toBe(mdiWhiteBalanceSunny)
    expect(themeIconPathGet("dark")).toBe(mdiWeatherNight)
    expect(themeIconPathGet("system")).toBe(mdiThemeLightDark)
    expect(themeIconPathGet("system", false)).toBe(mdiMonitor)
  })
})
