import { ttc } from "../../i18n/model/ttc"
import { classesMethodButton } from "../../ui/classes/classesMethodButton"
import { classesMethodButtonLastUsed } from "../../ui/classes/classesMethodButtonLastUsed"
import { classesMethodButtonCopy } from "../../ui/classes/classesMethodButtonCopy"
import { classesMethodLastUsedBadge } from "../../ui/classes/classesMethodLastUsedBadge"
import { Icon } from "../../ui/Icon"

type MethodChoiceButtonProps = {
  label: string
  detail?: string
  iconPath: string
  iconClass?: string
  disabled?: boolean
  current?: boolean
  lastUsed?: boolean
  onClick: () => void
}

export function MethodChoiceButton(props: MethodChoiceButtonProps) {
  return (
    <button
      classList={{ [classesMethodButton]: true, [classesMethodButtonLastUsed]: props.lastUsed }}
      type="button"
      disabled={props.disabled}
      aria-current={props.current ? "page" : undefined}
      onClick={props.onClick}
    >
      <Icon class={props.iconClass} path={props.iconPath} />
      <span class={classesMethodButtonCopy}>
        <span>
          {props.label}
          {props.lastUsed && <span class={classesMethodLastUsedBadge}>{ttc("Last used")}</span>}
        </span>
        {props.detail && <small>{props.detail}</small>}
      </span>
    </button>
  )
}
