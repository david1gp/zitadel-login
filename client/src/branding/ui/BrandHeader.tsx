type BrandHeaderProps = {
  assetUrl: () => string | undefined
  name: () => string
  onAssetError: () => void
}

export function BrandHeader(props: BrandHeaderProps) {
  return (
    <header class="brand">
      <div class="brand-identity">
        {props.assetUrl() ? (
          <img class="brand-logo" src={props.assetUrl()} alt={props.name()} onError={props.onAssetError} />
        ) : (
          <span class="brand-fallback">{props.name()}</span>
        )}
      </div>
    </header>
  )
}
