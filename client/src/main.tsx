import { render } from "solid-js/web"

import { App } from "./app/ui/App"
import { demoPathIsActive } from "./demo/model/demoPathIsActive"
import { DemoApp } from "./demo/ui/DemoApp"
import "./styles.css"

declare global {
  var ZITADEL_LOGIN_CONFIG: { apiOrigin?: string } | undefined
}

const root = document.getElementById("app")

if (!root) throw new Error("Missing application root")

if (demoPathIsActive(window.location.pathname)) {
  render(() => <DemoApp />, root)
} else {
  render(() => <App apiOrigin={globalThis.ZITADEL_LOGIN_CONFIG?.apiOrigin ?? ""} />, root)
}
