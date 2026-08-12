import type { LoginMethodSelection } from "../../flow/model/loginMethodSelectionSchema"

export function demoMfaSelectionGet(scenarioId: string): LoginMethodSelection | undefined {
  if (scenarioId === "mfa-totp" || scenarioId === "mfa-totp-enroll" || scenarioId === "mfa-totp-unavailable") {
    return { method: "mfa", factor: "totp" }
  }
  if (scenarioId === "mfa-email-otp" || scenarioId === "mfa-email-otp-code" || scenarioId === "mfa-email-otp-enroll") {
    return { method: "mfa", factor: "email_otp" }
  }
  if (scenarioId === "mfa-sms-otp") return { method: "mfa", factor: "sms_otp" }
  if (scenarioId === "mfa-u2f" || scenarioId === "mfa-u2f-unsupported" || scenarioId === "mfa-u2f-enroll") {
    return { method: "mfa", factor: "u2f" }
  }
  if (
    scenarioId === "mfa-passkey" ||
    scenarioId === "mfa-webauthn-enroll" ||
    scenarioId === "mfa-webauthn-unavailable"
  ) {
    return { method: "mfa", factor: "passkey" }
  }
  if (scenarioId.startsWith("mfa-")) return { method: "mfa" }
  return undefined
}
