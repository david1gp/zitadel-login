import { type JSX, splitProps } from "solid-js"

type IconProps = JSX.SvgSVGAttributes<SVGSVGElement> & {
  /** An SVG path string, e.g. `import { mdiRobotOutline } from "@adaptive-ds/mdi/mdiRobotOutline.js"`. */
  path: string
  /** Accessible label. When omitted the icon is decorative (`aria-hidden`). */
  title?: string
}

// splitProps (not destructuring) so dynamic props like `class` stay reactive.
export function Icon(props: IconProps) {
  const [local, rest] = splitProps(props, ["path", "title", "class"])
  return (
    <svg
      viewBox="0 0 24 24"
      class={["icon", local.class].filter(Boolean).join(" ")}
      role={local.title ? "img" : undefined}
      aria-hidden={local.title ? undefined : true}
      {...rest}
    >
      <title>{local.title}</title>
      <path d={local.path} />
    </svg>
  )
}
