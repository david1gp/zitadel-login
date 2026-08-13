import { classesMethodButton } from "../../ui/classes/classesMethodButton"
import { classesMethodButtonCopy } from "../../ui/classes/classesMethodButtonCopy"
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
      class={classesMethodButton}
      type="button"
      disabled={props.disabled}
      aria-current={props.current ? "page" : undefined}
      onClick={props.onClick}
    >
      <Icon path={props.iconPath} />
      <span class={classesMethodButtonCopy}>
        <span>{props.label}</span>
        <small>{props.detail}</small>
      </span>
    </button>
  )
}
