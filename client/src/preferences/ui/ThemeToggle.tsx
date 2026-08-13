import { classesThemeToggle } from "../../ui/classes/classesThemeToggle"
import { classesThemeToggleButton } from "../../ui/classes/classesThemeToggleButton"
import { classesThemeToggleIcon } from "../../ui/classes/classesThemeToggleIcon"
import { classesVisuallyHidden } from "../../ui/classes/classesVisuallyHidden"
import { Icon } from "../../ui/Icon"
import { themeIconPathGet } from "../model/themeIconPathGet"

type ThemeToggleProps = {
  preference: () => "light" | "dark" | "system"
  switchable: () => boolean
  select: (value: "light" | "dark" | "system") => void
}

export function ThemeToggle(props: ThemeToggleProps) {
  return (
    <fieldset
      class={classesThemeToggle}
      disabled={!props.switchable()}
      title={props.switchable() ? undefined : "Theme is set by the organization"}
    >
      <legend class={classesVisuallyHidden}>Theme</legend>
      {(["light", "dark", "system"] as const).map((value) => {
        const label = `${value[0]?.toUpperCase()}${value.slice(1)}`
        return (
          <button
            type="button"
            aria-pressed={props.preference() === value}
            aria-label={`${label} theme`}
            title={label}
            class={classesThemeToggleButton}
            onClick={() => props.select(value)}
          >
            <Icon class={classesThemeToggleIcon} path={themeIconPathGet(value, props.switchable())} />
          </button>
        )
      })}
    </fieldset>
  )
}
