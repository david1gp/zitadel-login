import type { PageBackgroundScreen } from "../../ui/styles/pageBackgroundScreenSchema"

export function pageBackgroundScreenFromDemoGet(id: string): PageBackgroundScreen {
  if (id === "directory") return "directory"
  if (id === "loading" || id === "continuing") return "loading"
  if (id === "fatal") return "fatal"
  if (id.startsWith("chooser")) return "chooser"
  if (id.startsWith("email-otp")) return "email_otp"
  if (id.startsWith("password-change")) return "password_change"
  if (id.startsWith("password")) return "password"
  if (id.startsWith("passkey")) return "passkey"
  if (id.startsWith("idp")) return "identity_provider"
  if (id.startsWith("mfa-")) return "mfa"
  if (id.startsWith("recovery-")) return "password_recovery"
  if (id.startsWith("reset")) return "password_reset"
  return "unsupported"
}
