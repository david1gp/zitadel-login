import type { JSX } from "solid-js"

import type { PageBackgroundScreen } from "./pageBackgroundScreenSchema"
import { stylesBgCube } from "./stylesBgCube"
import { stylesBgDotted } from "./stylesBgDotted"
import { stylesBgDottedSparse } from "./stylesBgDottedSparse"
import { stylesBgGrid } from "./stylesBgGrid"
import { stylesBgGridBlueprint } from "./stylesBgGridBlueprint"
import { stylesBgLeaf } from "./stylesBgLeaf"
import { stylesBgSlash } from "./stylesBgSlash"
import { stylesBgSlashSparse } from "./stylesBgSlashSparse"
import { stylesBgSquareZig } from "./stylesBgSquareZig"
import { stylesBgWave } from "./stylesBgWave"

const pageBackgroundStyles = {
  chooser: stylesBgDotted,
  directory: stylesBgDottedSparse,
  loading: stylesBgDottedSparse,
  fatal: stylesBgSlash,
  email_otp: stylesBgWave,
  password: stylesBgGrid,
  password_change: stylesBgGridBlueprint,
  passkey: stylesBgCube,
  identity_provider: stylesBgSlashSparse,
  mfa: stylesBgSquareZig,
  password_recovery: stylesBgLeaf,
  password_reset: stylesBgLeaf,
  unsupported: stylesBgSlash,
} as const satisfies Record<PageBackgroundScreen, JSX.CSSProperties>

export function pageBackgroundStyleGet(screen: PageBackgroundScreen): JSX.CSSProperties {
  return {
    ...pageBackgroundStyles[screen],
    "background-color": "var(--brand-background)",
  }
}
