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
      {(["light", "dark", "system"] as const).map((value) => (
        <button
          type="button"
          aria-pressed={props.preference() === value}
          aria-label={`${value[0]?.toUpperCase()}${value.slice(1)} theme`}
          onClick={() => props.select(value)}
        >
          {`${value[0]?.toUpperCase()}${value.slice(1)}`}
        </button>
      ))}
    </fieldset>
  )
}
