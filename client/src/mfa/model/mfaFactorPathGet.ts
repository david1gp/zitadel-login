import type { MfaMethodSummary } from "./mfaMethodSummarySchema"

export function mfaFactorPathGet(type: MfaMethodSummary["type"]): string {
  if (type === "email_otp") return "email-otp"
  if (type === "sms_otp") return "sms-otp"
  return type
}
