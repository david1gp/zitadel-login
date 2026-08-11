import type { MfaMethodSummary } from "./mfaMethodSummarySchema"

export function mfaFactorTypeGet(path: string): MfaMethodSummary["type"] | undefined {
  if (path === "email-otp" || path === "email_otp") return "email_otp"
  if (path === "sms-otp" || path === "sms_otp") return "sms_otp"
  if (path === "totp" || path === "u2f" || path === "passkey") return path
  return undefined
}
