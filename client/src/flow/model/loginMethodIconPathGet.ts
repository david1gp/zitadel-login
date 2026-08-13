import { mdiEmailOutline } from "@adaptive-ds/mdi/mdiEmailOutline.js"
import { mdiFingerprint } from "@adaptive-ds/mdi/mdiFingerprint.js"
import { mdiFormTextboxPassword } from "@adaptive-ds/mdi/mdiFormTextboxPassword.js"
import { mdiShieldOutline } from "@adaptive-ds/mdi/mdiShieldOutline.js"

import { identityProviderIconPathGet } from "../../identity-provider/model/identityProviderIconPathGet"
import { mfaFactorIconPathGet } from "../../mfa/model/mfaFactorIconPathGet"
import type { LoginMethodSelection } from "./loginMethodSelectionSchema"

export function loginMethodIconPathGet(selection: LoginMethodSelection, identityProviderType = ""): string {
  if (selection.method === "email_otp") return mdiEmailOutline
  if (selection.method === "password") return mdiFormTextboxPassword
  if (selection.method === "passkey") return mdiFingerprint
  if (selection.method === "mfa") return selection.factor ? mfaFactorIconPathGet(selection.factor) : mdiShieldOutline
  return identityProviderIconPathGet(identityProviderType)
}
