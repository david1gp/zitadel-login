import type { MfaOptions } from "../../mfa/model/mfaOptionsSchema"
import { demoCsrfToken } from "./demoCsrfToken"
import { demoDelay } from "./demoDelay"
import { demoJsonResponseCreate } from "./demoJsonResponseCreate"
import { demoMfaOptionsGet } from "./demoMfaOptionsGet"
import { demoPasskeyCreationOptions } from "./demoPasskeyCreationOptions"
import { demoPasskeyOptions } from "./demoPasskeyOptions"
import { demoRequestPathGet } from "./demoRequestPathGet"
import { demoTransitionComplete } from "./demoTransitionComplete"
import { demoTransitionRender } from "./demoTransitionRender"

function optionsBody(scenarioId: string): unknown {
  const options = demoMfaOptionsGet(scenarioId)
  if (options === "loading") {
    return { success: true, data: { mode: "select", methods: [{ type: "totp" }, { type: "email_otp" }] } }
  }
  if (options === "error") {
    return { success: false, op: "mfaV2OptionsApiRequest", errorMessage: "mfa_unavailable" }
  }
  return { success: true, data: options as MfaOptions }
}

function completeBody() {
  return { success: true, data: demoTransitionComplete }
}

function wrappedCompleteBody() {
  return { success: true, data: { transition: demoTransitionComplete } }
}

export function demoFetchCreate(scenarioId: () => string): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    await demoDelay(280)
    const path = demoRequestPathGet(input)
    const id = scenarioId()

    if (path.endsWith("/api/v2/mfa/options")) {
      if (id === "mfa-loading") return new Promise<Response>(() => undefined)
      const body = optionsBody(id)
      const failed = typeof body === "object" && body !== null && "success" in body && body.success === false
      return demoJsonResponseCreate(body, failed ? 503 : 200)
    }

    if (path.endsWith("/api/v2/password/reset/bootstrap")) {
      return demoJsonResponseCreate({
        success: true,
        data: { status: "ready", csrfToken: demoCsrfToken, expiresAt: Date.now() + 600_000 },
      })
    }

    if (path.endsWith("/api/v2/password/reset/request")) {
      return demoJsonResponseCreate({ success: true, data: { status: "accepted" } })
    }

    if (path.endsWith("/api/v2/password/reset/set-bootstrap")) {
      return demoJsonResponseCreate({
        success: true,
        data: { status: "ready", screen: "password_reset", csrfToken: demoCsrfToken, expiresAt: Date.now() + 600_000 },
      })
    }

    if (path.endsWith("/api/v2/password/reset/set")) {
      return demoJsonResponseCreate({ success: true, data: { status: "complete" } })
    }

    if (path.endsWith("/api/v2/password/change-required")) {
      return demoJsonResponseCreate(completeBody())
    }

    if (path.endsWith("/api/v2/mfa/otp/enroll")) {
      return demoJsonResponseCreate({
        success: true,
        data: {
          provisioningUri: "otpauth://totp/Demo%20Org:ada@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Demo%20Org",
          secret: "JBSWY3DPEHPK3PXP",
          transition: demoTransitionRender("/demo/mfa/totp-enroll", { name: "mfa_totp_setup" }),
        },
      })
    }

    if (path.endsWith("/api/v2/mfa/otp/enroll/verify")) {
      return demoJsonResponseCreate(wrappedCompleteBody())
    }

    if (path.endsWith("/api/v2/mfa/u2f/enroll") || path.endsWith("/api/v2/mfa/passkey/enroll")) {
      return demoJsonResponseCreate({
        success: true,
        data: {
          options: demoPasskeyCreationOptions,
          transition: demoTransitionRender("/demo/mfa/webauthn-enroll", {
            name: "mfa_webauthn_setup",
            method: path.includes("/u2f/") ? "u2f" : "passkey",
          }),
        },
      })
    }

    if (path.endsWith("/api/v2/mfa/u2f/enroll/verify") || path.endsWith("/api/v2/mfa/passkey/enroll/verify")) {
      return demoJsonResponseCreate(wrappedCompleteBody())
    }

    if (path.endsWith("/api/v2/mfa/u2f/challenge")) {
      return demoJsonResponseCreate({
        success: true,
        data: demoTransitionRender("/demo/mfa/u2f", { name: "mfa", options: demoPasskeyOptions }),
      })
    }

    if (path.endsWith("/api/v2/mfa/email-otp/enroll")) {
      return demoJsonResponseCreate({
        success: true,
        data: {
          transition: demoTransitionRender("/demo/mfa/email-otp/code", {
            name: "mfa_email_otp_code",
            challengeIssued: true,
          }),
        },
      })
    }

    if (
      path.endsWith("/api/v2/mfa/email-otp/challenge") ||
      path.endsWith("/api/v2/mfa/email-otp/resend") ||
      path.endsWith("/api/v2/mfa/sms-otp/challenge") ||
      path.endsWith("/api/v2/mfa/sms-otp/resend")
    ) {
      return demoJsonResponseCreate({
        success: true,
        data: demoTransitionRender("/demo/mfa/email-otp/code", { name: "mfa_email_otp_code", challengeIssued: true }),
      })
    }

    if (
      path.endsWith("/api/v2/mfa/totp/verify") ||
      path.endsWith("/api/v2/mfa/email-otp/verify") ||
      path.endsWith("/api/v2/mfa/sms-otp/verify") ||
      path.endsWith("/api/v2/mfa/u2f/verify") ||
      path.endsWith("/api/v2/mfa/skip")
    ) {
      return demoJsonResponseCreate(completeBody())
    }

    return demoJsonResponseCreate(
      {
        success: false,
        op: "demoFetchCreate",
        errorMessage: "This demo action is not wired yet.",
      },
      404,
    )
  }) as typeof fetch
}
