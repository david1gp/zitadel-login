import { mdiMonitor } from "@adaptive-ds/mdi/mdiMonitor.js"
import { mdiThemeLightDark } from "@adaptive-ds/mdi/mdiThemeLightDark.js"
import { mdiWeatherNight } from "@adaptive-ds/mdi/mdiWeatherNight.js"
import { mdiWhiteBalanceSunny } from "@adaptive-ds/mdi/mdiWhiteBalanceSunny.js"

export function themeIconPathGet(value: "light" | "dark" | "system", switchable = true): string {
  if (value === "light") return mdiWhiteBalanceSunny
  if (value === "dark") return mdiWeatherNight
  if (!switchable) return mdiMonitor
  return mdiThemeLightDark
}
