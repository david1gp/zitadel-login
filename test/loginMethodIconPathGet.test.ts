import { describe, expect, test } from "bun:test"

import { mdiEmailOutline } from "@adaptive-ds/mdi/mdiEmailOutline.js"
import { mdiFingerprint } from "@adaptive-ds/mdi/mdiFingerprint.js"
import { mdiFormTextboxPassword } from "@adaptive-ds/mdi/mdiFormTextboxPassword.js"
import { mdiGithub } from "@adaptive-ds/mdi/mdiGithub.js"
import { mdiShieldOutline } from "@adaptive-ds/mdi/mdiShieldOutline.js"
import { mdiTwoFactorAuthentication } from "@adaptive-ds/mdi/mdiTwoFactorAuthentication.js"

import { loginMethodIconPathGet } from "../client/src/flow/model/loginMethodIconPathGet"

describe("loginMethodIconPathGet", () => {
  test("maps each login method to an MDI path", () => {
    expect(loginMethodIconPathGet({ method: "email_otp" })).toBe(mdiEmailOutline)
    expect(loginMethodIconPathGet({ method: "password" })).toBe(mdiFormTextboxPassword)
    expect(loginMethodIconPathGet({ method: "passkey" })).toBe(mdiFingerprint)
    expect(loginMethodIconPathGet({ method: "mfa" })).toBe(mdiShieldOutline)
    expect(loginMethodIconPathGet({ method: "mfa", factor: "totp" })).toBe(mdiTwoFactorAuthentication)
    expect(loginMethodIconPathGet({ method: "identity_provider", identityProviderId: "github-1" }, "github")).toBe(
      mdiGithub,
    )
  })
})
