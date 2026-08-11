import type { MfaMethodSummary } from "./mfaMethodSummarySchema"

export function mfaFactorLabelGet(type: MfaMethodSummary["type"]): string {
  if (type === "totp") return "Authenticator app"
  if (type === "email_otp") return "Email code"
  if (type === "sms_otp") return "SMS code"
  if (type === "u2f") return "Security key"
  if (type === "passkey") return "Passkey"
  return "2-Step Verification"
}
