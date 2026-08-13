import { classesBrand } from "../../ui/classes/classesBrand"
import { classesBrandIdentity } from "../../ui/classes/classesBrandIdentity"
import { classesBrandLogo } from "../../ui/classes/classesBrandLogo"
import { BrandLogo } from "./BrandLogo"

type BrandHeaderProps = {
  assetUrl: () => string | undefined
  name: () => string
  onAssetError: () => void
}

export function BrandHeader(props: BrandHeaderProps) {
  return (
    <header class={classesBrand}>
      <div class={classesBrandIdentity}>
        {props.assetUrl() ? (
          <img class={classesBrandLogo} src={props.assetUrl()} alt={props.name()} onError={props.onAssetError} />
        ) : (
          <BrandLogo name={props.name} />
        )}
      </div>
    </header>
  )
}
