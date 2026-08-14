import type { JSX } from "solid-js"
import { Show } from "solid-js"

import { LanguageSwitcher } from "../i18n/ui/LanguageSwitcher"
import { ttc } from "../i18n/model/ttc"
import { ThemeToggle } from "../preferences/ui/ThemeToggle"
import { classMerge } from "./classMerge"
import { classesLoginCard } from "./classes/classesLoginCard"
import { classesLoginFrame } from "./classes/classesLoginFrame"
import { classesLoginLegal } from "./classes/classesLoginLegal"
import { classesLoginTheme } from "./classes/classesLoginTheme"

type LoginFrameProps = {
  busy: () => boolean
  cardClass?: string | false
  children: JSX.Element
  legal: () => { privacyPolicyUrl?: string; termsOfServiceUrl?: string } | undefined
  preferredTheme: () => "light" | "dark" | "system"
  themeSelect: (value: "light" | "dark" | "system") => void
  themeSwitchable: () => boolean
}

export function LoginFrame(props: LoginFrameProps) {
  return (
    <div class={classMerge(classesLoginFrame, props.cardClass)}>
      <div class={classesLoginTheme}>
        <LanguageSwitcher />
        <ThemeToggle preference={props.preferredTheme} switchable={props.themeSwitchable} select={props.themeSelect} />
      </div>
      <section
        class={classMerge(classesLoginCard, "w-full min-h-0 flex-1 sm:flex-none", props.cardClass)}
        aria-busy={props.busy()}
      >
        {props.children}
      </section>
      <Show when={props.legal()?.termsOfServiceUrl && props.legal()?.privacyPolicyUrl}>
        <p class={classesLoginLegal}>
          {ttc("By continuing, you acknowledge the")}{" "}
          <a href={props.legal()?.termsOfServiceUrl}>{ttc("Terms of Service")}</a> {ttc("and")}{" "}
          <a href={props.legal()?.privacyPolicyUrl}>{ttc("Privacy Policy")}</a>.
        </p>
      </Show>
    </div>
  )
}
