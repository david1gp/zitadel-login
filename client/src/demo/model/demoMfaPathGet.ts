import type { LoginMethodSelection } from "../../flow/model/loginMethodSelectionSchema"

const enrollScenarioIds = new Set([
  "mfa-enroll",
  "mfa-totp-enroll",
  "mfa-email-otp-enroll",
  "mfa-webauthn-enroll",
  "mfa-u2f-enroll",
  "mfa-skip-optional",
])

export function demoMfaPathGet(next: LoginMethodSelection | undefined, currentId: string): string {
  if (next?.method !== "mfa") return "/demo/chooser"
  if (!next.factor) {
    if (enrollScenarioIds.has(currentId)) return "/demo/mfa/enroll"
    if (currentId === "mfa-skip-satisfied") return "/demo/mfa/satisfied"
    if (currentId === "mfa-fallback") return "/demo/mfa/fallback"
    return "/demo/mfa"
  }
  const enroll = enrollScenarioIds.has(currentId)
  if (next.factor === "totp") return enroll ? "/demo/mfa/totp-enroll" : "/demo/mfa/totp"
  if (next.factor === "email_otp") return enroll ? "/demo/mfa/email-otp/enroll" : "/demo/mfa/email-otp"
  if (next.factor === "sms_otp") return "/demo/mfa/sms-otp"
  if (next.factor === "u2f") return enroll ? "/demo/mfa/u2f-enroll" : "/demo/mfa/u2f"
  return enroll ? "/demo/mfa/webauthn-enroll" : "/demo/mfa/passkey"
}
