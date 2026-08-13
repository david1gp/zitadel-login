import type { LoginMethodSelection } from "../../flow/model/loginMethodSelectionSchema"
import type { PageBackgroundScreen } from "../../ui/styles/pageBackgroundScreenSchema"

export function pageBackgroundScreenFromAppGet(input: {
  status: "loading" | "ready" | "continuing" | "fatal" | "password_recovery"
  recoveryRoute: "request" | "reset" | undefined
  passwordChangeRequired: boolean
  selection: LoginMethodSelection | undefined
}): PageBackgroundScreen {
  if (input.status === "loading" || input.status === "continuing") return "loading"
  if (input.status === "fatal") return "fatal"
  if (input.status === "password_recovery") {
    return input.recoveryRoute === "reset" ? "password_reset" : "password_recovery"
  }
  if (input.passwordChangeRequired) return "password_change"
  if (!input.selection) return "chooser"
  if (input.selection.method === "email_otp") return "email_otp"
  if (input.selection.method === "password") return "password"
  if (input.selection.method === "passkey") return "passkey"
  if (input.selection.method === "identity_provider") return "identity_provider"
  return "mfa"
}
