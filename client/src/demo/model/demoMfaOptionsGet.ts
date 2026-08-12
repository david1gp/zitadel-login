import type { MfaOptions } from "../../mfa/model/mfaOptionsSchema"

const allMethods = [
  { type: "totp" as const },
  { type: "email_otp" as const },
  { type: "sms_otp" as const },
  { type: "u2f" as const },
  { type: "passkey" as const },
]

export type DemoMfaOptionsResult = MfaOptions | "loading" | "error"

export function demoMfaOptionsGet(scenarioId: string): DemoMfaOptionsResult {
  if (scenarioId === "mfa-loading") return "loading"
  if (scenarioId === "mfa-retry") return "error"
  if (scenarioId === "mfa-enroll") {
    return {
      mode: "enroll",
      methods: [{ type: "totp" }, { type: "email_otp" }, { type: "u2f" }, { type: "passkey" }],
    }
  }
  if (scenarioId === "mfa-totp-enroll") return { mode: "enroll", methods: [{ type: "totp" }] }
  if (scenarioId === "mfa-email-otp-enroll") return { mode: "enroll", methods: [{ type: "email_otp" }] }
  if (scenarioId === "mfa-webauthn-enroll") return { mode: "enroll", methods: [{ type: "passkey" }] }
  if (scenarioId === "mfa-u2f-enroll") return { mode: "enroll", methods: [{ type: "u2f" }] }
  if (scenarioId === "mfa-skip-optional") {
    return { mode: "skip", reason: "optional_setup", methods: [{ type: "totp" }, { type: "email_otp" }] }
  }
  if (scenarioId === "mfa-skip-satisfied") return { mode: "skip", reason: "factor_satisfied", methods: [] }
  if (scenarioId === "mfa-fallback") return { mode: "fallback", reason: "recovery_code" }
  return { mode: "select", methods: allMethods }
}
