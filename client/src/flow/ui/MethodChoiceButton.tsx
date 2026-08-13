import { Icon } from "../../ui/Icon"

type MethodChoiceButtonProps = {
  label: string
  detail: string
  iconPath: string
  disabled?: boolean
  current?: boolean
  onClick: () => void
}

export function MethodChoiceButton(props: MethodChoiceButtonProps) {
  return (
    <button
      class="method-button"
      type="button"
      disabled={props.disabled}
      aria-current={props.current ? "page" : undefined}
      onClick={props.onClick}
    >
      <Icon path={props.iconPath} />
      <span class="method-button-copy">
        <span>{props.label}</span>
        <small>{props.detail}</small>
      </span>
    </button>
  )
}
