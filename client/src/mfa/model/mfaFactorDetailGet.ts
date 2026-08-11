import type { MfaMethodSummary } from "./mfaMethodSummarySchema"

export function mfaFactorDetailGet(type: MfaMethodSummary["type"]): string {
  if (type === "totp") return "Use a code from Google Authenticator, Authy, or 1Password"
  if (type === "email_otp") return "Receive a one-time verification code via email"
  if (type === "sms_otp") return "Receive a one-time verification code via SMS"
  if (type === "u2f") return "Use a hardware security key (FIDO U2F)"
  if (type === "passkey") return "Verify with a passkey or biometric credential"
  return "Verification method"
}
