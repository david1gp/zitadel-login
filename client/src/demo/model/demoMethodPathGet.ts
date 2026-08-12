import type { LoginMethodSelection } from "../../flow/model/loginMethodSelectionSchema"
import { demoMfaPathGet } from "./demoMfaPathGet"

export function demoMethodPathGet(selection: LoginMethodSelection): string {
  if (selection.method === "email_otp") return "/demo/email-otp"
  if (selection.method === "password") return "/demo/password"
  if (selection.method === "passkey") return "/demo/passkey"
  if (selection.method === "identity_provider") {
    if (selection.subroute) return `/demo/idp/${selection.subroute}`
    return "/demo/idp"
  }
  return demoMfaPathGet(selection, "mfa-select")
}
