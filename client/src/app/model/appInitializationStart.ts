import { bootstrapApiRequest } from "../../branding/api/bootstrapApiRequest"
import type { BootstrapView } from "../../branding/model/bootstrapViewSchema"
import { fallbackBootstrap } from "../../branding/model/fallbackBootstrap"
import { flowV2InitializeApiRequest } from "../../flow/api/flowV2InitializeApiRequest"
import { flowV2ResumeApiRequest } from "../../flow/api/flowV2ResumeApiRequest"
import { appIngressRead } from "../../flow/model/appIngressRead"
import { flowHandleRead } from "../../flow/model/flowHandleRead"
import type { FlowV2Transition } from "../../flow/model/flowV2TransitionSchema"
import type { LoginMethodSelection } from "../../flow/model/loginMethodSelectionSchema"
import { loginRouteRead } from "../../flow/model/loginRouteRead"
import type { LoginPreference } from "../../preferences/model/loginPreferenceSchema"
import type { Result } from "../../result/Result"
import { resultCreate } from "../../result/resultCreate"
import type { RecentAccountSummary } from "../../session/model/recentAccountSummarySchema"

export type AppInitializationData =
  | {
      status: "fatal"
      errorMessage: string
    }
  | {
      status: "fallback"
      fallbackUrl: string
    }
  | {
      status: "continue"
      continuationUrl: string
    }
  | {
      status: "ready"
      bootstrap: BootstrapView
      csrfToken: string
      flowHandle: string
      canonicalRoute: string
      emailStep: "email" | "code"
      loginHint?: string
      passkeyOptions?: unknown
      routeSelection?: LoginMethodSelection
      storedIdentifier?: string
      notice?: string
      recentAccounts?: RecentAccountSummary[]
      totpSetupUnavailable: boolean
      emailOtpCodePending: boolean
      webAuthnSetupUnavailable?: "u2f" | "passkey"
      passwordChangeRequired?: { expired: boolean }
    }

export async function appInitializationStart(
  apiOrigin: string,
  currentUrl: URL,
  preferenceInitialize: (organizationId: string) => LoginPreference | undefined,
): Promise<Result<AppInitializationData>> {
  const ingress = appIngressRead(currentUrl)
  const flowHandleRes = flowHandleRead(currentUrl)
  const route = loginRouteRead(currentUrl.pathname)

  if (!ingress.success) {
    return resultCreate({ status: "fatal", errorMessage: ingress.errorMessage })
  }
  if (!flowHandleRes.success) {
    return resultCreate({ status: "fatal", errorMessage: flowHandleRes.errorMessage })
  }
  if (!route.success) {
    return resultCreate({ status: "fatal", errorMessage: route.errorMessage })
  }

  let bootstrapResult: Result<BootstrapView> | undefined
  let transitionResult: Result<FlowV2Transition>
  let flowHandle = flowHandleRes.data

  if (ingress.data) {
    const [bRes, initRes] = await Promise.all([
      bootstrapApiRequest(apiOrigin, ingress.data),
      flowV2InitializeApiRequest(apiOrigin, ingress.data),
    ])
    bootstrapResult = bRes
    transitionResult = initRes
  } else if (flowHandle) {
    const [bRes, resumeRes] = await Promise.all([
      bootstrapApiRequest(apiOrigin),
      flowV2ResumeApiRequest(apiOrigin, flowHandle),
    ])
    bootstrapResult = bRes
    transitionResult = resumeRes
  } else {
    return resultCreate({ status: "fatal", errorMessage: "Return to the application and start sign-in again." })
  }

  if (!transitionResult.success) {
    return resultCreate({ status: "fatal", errorMessage: transitionResult.errorMessage })
  }

  const transition = transitionResult.data
  if (transition.kind === "fallback") {
    return resultCreate({ status: "fallback", fallbackUrl: transition.path })
  }
  if (transition.kind === "complete") {
    return resultCreate({ status: "continue", continuationUrl: transition.path })
  }

  if (transition.kind !== "render") {
    return resultCreate({ status: "fatal", errorMessage: "The sign-in service returned an invalid response." })
  }

  const parsedCanonicalUrl = new URL(transition.route, "https://login.local")
  if (!flowHandle) flowHandle = parsedCanonicalUrl.searchParams.get("flow") ?? undefined
  const canonicalRoute = loginRouteRead(parsedCanonicalUrl.pathname)
  const canonicalRouteSelection = canonicalRoute.success ? canonicalRoute.data : undefined
  if (!flowHandle) {
    return resultCreate({ status: "fatal", errorMessage: "The sign-in service returned an invalid response." })
  }

  const bootstrapData = bootstrapResult?.success ? bootstrapResult.data : fallbackBootstrap
  const noticeMessage =
    bootstrapResult && !bootstrapResult.success ? "Some sign-in methods are temporarily unavailable." : undefined

  const stored = preferenceInitialize(bootstrapData.organization.id)
  const emailStep = transition.screen.name === "email_otp_code" ? "code" : "email"
  const loginHint = transition.screen.name === "email_otp_start" ? transition.screen.loginHint : undefined
  const passkeyOptions = transition.screen.name === "passkey" ? transition.screen.options : undefined
  const recentAccounts = transition.screen.name === "email_otp_start" ? transition.screen.recentAccounts : undefined

  return resultCreate({
    status: "ready",
    bootstrap: bootstrapData,
    csrfToken: transition.csrfToken,
    flowHandle,
    canonicalRoute: transition.route,
    emailStep,
    loginHint,
    passkeyOptions,
    routeSelection: ingress.data ? route.data : canonicalRouteSelection,
    storedIdentifier: stored?.identifier,
    notice: noticeMessage,
    recentAccounts,
    totpSetupUnavailable: transition.screen.name === "mfa_totp_setup",
    emailOtpCodePending: transition.screen.name === "mfa_email_otp_code",
    webAuthnSetupUnavailable: transition.screen.name === "mfa_webauthn_setup" ? transition.screen.method : undefined,
    passwordChangeRequired:
      transition.screen.name === "password_change_required" ? { expired: transition.screen.expired } : undefined,
  })
}
