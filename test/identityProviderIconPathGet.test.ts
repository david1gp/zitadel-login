import { describe, expect, test } from "bun:test"

import { mdiAccountNetworkOutline } from "@adaptive-ds/mdi/mdiAccountNetworkOutline.js"
import { mdiApple } from "@adaptive-ds/mdi/mdiApple.js"
import { mdiGithub } from "@adaptive-ds/mdi/mdiGithub.js"
import { mdiGoogle } from "@adaptive-ds/mdi/mdiGoogle.js"
import { mdiMicrosoft } from "@adaptive-ds/mdi/mdiMicrosoft.js"
import { mdiOpenid } from "@adaptive-ds/mdi/mdiOpenid.js"
import { mdiWeb } from "@adaptive-ds/mdi/mdiWeb.js"

import { identityProviderIconPathGet } from "../client/src/identity-provider/model/identityProviderIconPathGet"

describe("identityProviderIconPathGet", () => {
  test("maps known provider types and names to brand paths", () => {
    expect(identityProviderIconPathGet("google")).toBe(mdiGoogle)
    expect(identityProviderIconPathGet("github_es")).toBe(mdiGithub)
    expect(identityProviderIconPathGet("azure_ad")).toBe(mdiMicrosoft)
    expect(identityProviderIconPathGet("apple")).toBe(mdiApple)
    expect(identityProviderIconPathGet("ldap")).toBe(mdiAccountNetworkOutline)
    expect(identityProviderIconPathGet("oidc")).toBe(mdiOpenid)
    expect(identityProviderIconPathGet("unknown", "Microsoft Entra")).toBe(mdiMicrosoft)
    expect(identityProviderIconPathGet("custom")).toBe(mdiWeb)
  })
})
