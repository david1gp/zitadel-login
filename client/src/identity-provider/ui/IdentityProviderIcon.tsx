import { classesIdpIcon } from "../../ui/classes/classesIdpIcon"
import { classesIdpIconWrapper } from "../../ui/classes/classesIdpIconWrapper"
import { Icon } from "../../ui/Icon"
import { identityProviderIconPathGet } from "../model/identityProviderIconPathGet"

type IdentityProviderIconProps = {
  type: string
  name: string
}

export function IdentityProviderIcon(props: IdentityProviderIconProps) {
  return (
    <span class={classesIdpIconWrapper}>
      <Icon class={classesIdpIcon} path={identityProviderIconPathGet(props.type, props.name)} />
    </span>
  )
}
