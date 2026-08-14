import { mdiTranslateVariant } from "@adaptive-ds/mdi/mdiTranslateVariant.js"
import { For, Show } from "solid-js"

import { classesLanguageSwitcher } from "../../ui/classes/classesLanguageSwitcher"
import { classesLanguageSwitcherMenu } from "../../ui/classes/classesLanguageSwitcherMenu"
import { classesLanguageSwitcherOption } from "../../ui/classes/classesLanguageSwitcherOption"
import { classesLanguageSwitcherSummary } from "../../ui/classes/classesLanguageSwitcherSummary"
import { classesThemeToggleIcon } from "../../ui/classes/classesThemeToggleIcon"
import { Icon } from "../../ui/Icon"
import { ttc } from "../model/ttc"
import { languageSwitcherStateCreate } from "./languageSwitcherStateCreate"

export function LanguageSwitcher() {
  const state = languageSwitcherStateCreate()

  return (
    <details
      ref={state.detailsRegister}
      class={classesLanguageSwitcher}
      open={state.open()}
      onToggle={state.toggle}
      data-testid="language-switcher"
    >
      <summary class={classesLanguageSwitcherSummary} aria-label={ttc("Language")} title={ttc("Language")}>
        <Icon class={classesThemeToggleIcon} path={mdiTranslateVariant} />
        {state.current()?.nativeName}
      </summary>
      <Show when={state.open()}>
        <ul class={classesLanguageSwitcherMenu} aria-label={ttc("Language")}>
          <For each={state.options()}>
            {(option) => (
              <li>
                <button
                  type="button"
                  lang={option.code}
                  class={classesLanguageSwitcherOption}
                  aria-current={state.currentCode() === option.code ? "true" : undefined}
                  onClick={() => state.optionSelect(option.code)}
                >
                  {option.nativeName}
                </button>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </details>
  )
}
