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
      class="theme-toggle"
      disabled={!props.switchable()}
      title={props.switchable() ? undefined : "Theme is set by the organization"}
    >
      <legend class="visually-hidden">Theme</legend>
      {(["light", "dark", "system"] as const).map((value) => {
        const label = `${value[0]?.toUpperCase()}${value.slice(1)}`
        return (
          <button
            type="button"
            aria-pressed={props.preference() === value}
            aria-label={`${label} theme`}
            title={label}
            onClick={() => props.select(value)}
          >
            <Icon path={themeIconPathGet(value, props.switchable())} />
          </button>
        )
      })}
    </fieldset>
  )
}
