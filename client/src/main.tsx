import { render } from "solid-js/web"

import { App } from "./app/ui/App"
import "./styles.css"

declare global {
  var ZITADEL_LOGIN_CONFIG: { apiOrigin?: string } | undefined
}

const root = document.getElementById("app")

if (!root) throw new Error("Missing application root")

render(() => <App apiOrigin={globalThis.ZITADEL_LOGIN_CONFIG?.apiOrigin ?? ""} />, root)
