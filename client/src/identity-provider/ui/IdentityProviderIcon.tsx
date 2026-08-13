import { Icon } from "../../ui/Icon"
import { identityProviderIconPathGet } from "../model/identityProviderIconPathGet"

type IdentityProviderIconProps = {
  type: string
  name: string
}

export function IdentityProviderIcon(props: IdentityProviderIconProps) {
  return (
    <span class="idp-icon-wrapper">
      <Icon class="idp-icon" path={identityProviderIconPathGet(props.type, props.name)} />
    </span>
  )
}
