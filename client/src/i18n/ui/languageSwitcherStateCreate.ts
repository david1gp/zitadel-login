import { onCleanup, onMount } from "solid-js"

import { i18nStore } from "../model/i18nStore"
import type { Language } from "../model/languageSchema"
import { languageSelect } from "../model/languageSelect"
import { languagesSupported } from "../model/languagesSupported"
import { createSignalObject } from "../../ui/createSignalObject"

export function languageSwitcherStateCreate() {
  const open = createSignalObject(false)
  let details: HTMLDetailsElement | undefined

  const detailsRegister = (element: HTMLDetailsElement) => {
    details = element
  }

  const documentClick = (event: MouseEvent) => {
    if (!details || !open.get()) return
    if (event.target instanceof Node && details.contains(event.target)) return
    open.set(false)
  }

  const documentKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape") open.set(false)
  }

  onMount(() => {
    document.addEventListener("click", documentClick)
    document.addEventListener("keydown", documentKeydown)
  })
  onCleanup(() => {
    document.removeEventListener("click", documentClick)
    document.removeEventListener("keydown", documentKeydown)
  })

  const toggle = (event: Event & { currentTarget: HTMLDetailsElement }) => {
    open.set(event.currentTarget.open)
  }

  const optionSelect = (language: Language) => {
    open.set(false)
    void languageSelect(window, language)
  }

  const currentOption = () =>
    languagesSupported.find((entry) => entry.code === i18nStore.language.get()) ?? languagesSupported[0]

  return {
    open: open.get,
    options: () => languagesSupported,
    current: currentOption,
    currentCode: () => i18nStore.language.get(),
    detailsRegister,
    toggle,
    optionSelect,
  }
}
