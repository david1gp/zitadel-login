import { createEffect, createMemo, onCleanup, onMount } from "solid-js"

import type { SignalObject } from "../../ui/SignalObject"
import { createSignalObject } from "../../ui/createSignalObject"
import { themePreferenceLoad } from "../../preferences/model/themePreferenceLoad"
import { themePreferenceSave } from "../../preferences/model/themePreferenceSave"
import type { BootstrapView } from "../model/bootstrapViewSchema"

type Theme = "light" | "dark"
type ThemePreference = "light" | "dark" | "system"

export function brandingStateCreate(bootstrap: SignalObject<BootstrapView>, storage: Storage | undefined) {
  const preferredTheme = createSignalObject<ThemePreference>("system")
  const systemTheme = createSignalObject<Theme>("light")
  const brandAssetFailed = createSignalObject(false)
  const effectiveTheme = createMemo<Theme>(() => {
    const forced = bootstrap.get().branding.themeMode
    if (forced === "light" || forced === "dark") return forced
    const preferred = preferredTheme.get()
    return preferred === "system" ? systemTheme.get() : preferred
  })
  const themeSwitchable = createMemo(() => bootstrap.get().branding.themeMode === "system")
  const brandTheme = createMemo(() => bootstrap.get().branding[effectiveTheme()])
  const brandAssetUrl = createMemo(() => {
    if (brandAssetFailed.get()) return undefined
    return brandTheme().logoUrl ?? brandTheme().iconUrl
  })

  createEffect(() => {
    brandTheme().logoUrl
    brandTheme().iconUrl
    brandAssetFailed.set(false)
  })

  createEffect(() => {
    const theme = effectiveTheme()
    const colors = brandTheme().colors
    const root = document.documentElement
    root.dataset.theme = theme
    root.style.colorScheme = theme
    root.style.setProperty("--brand-background", colors.background)
    root.style.setProperty("--brand-font", colors.font)
    root.style.setProperty("--brand-primary", colors.primary)
    root.style.setProperty("--brand-warn", colors.warn)
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", colors.background)
  })

  createEffect(() => {
    const fontUrl = bootstrap.get().branding.fontUrl
    const id = "zitadel-brand-font"
    document.getElementById(id)?.remove()
    document.documentElement.style.removeProperty("--brand-font-family")
    if (!fontUrl) return
    const style = document.createElement("style")
    style.id = id
    style.textContent = `@font-face{font-family:"Zitadel Brand";src:url(${JSON.stringify(fontUrl)});font-display:swap}`
    document.head.append(style)
    document.documentElement.style.setProperty("--brand-font-family", '"Zitadel Brand"')
  })

  onMount(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const mediaChange = () => systemTheme.set(media.matches ? "dark" : "light")
    const storedThemeLoad = () => {
      if (!storage) return
      const loaded = themePreferenceLoad(storage)
      preferredTheme.set(loaded.success && loaded.data ? loaded.data.value : "system")
    }
    const storageChange = (event: StorageEvent) => {
      if (event.key === "zitadel-login:theme:v1") storedThemeLoad()
    }
    mediaChange()
    storedThemeLoad()
    media.addEventListener("change", mediaChange)
    window.addEventListener("storage", storageChange)
    onCleanup(() => {
      media.removeEventListener("change", mediaChange)
      window.removeEventListener("storage", storageChange)
    })
  })

  return {
    preferredTheme: preferredTheme.get,
    effectiveTheme,
    themeSwitchable,
    brandAssetUrl,
    brandAssetFail: () => brandAssetFailed.set(true),
    themeSelect: (value: ThemePreference) => {
      if (!themeSwitchable()) return
      preferredTheme.set(value)
      if (!storage) return
      themePreferenceSave(storage, { value, updatedAt: Date.now() })
    },
  }
}
