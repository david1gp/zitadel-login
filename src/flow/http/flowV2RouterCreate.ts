import type { Context } from "hono"
import { Hono } from "hono"
import * as v from "valibot"
import { workerBindingsParse } from "../../config/workerBindingsParse"
import type { WorkerBindings, WorkerBindingsInput, WorkerRateLimiter } from "../../config/workerBindingsSchema"
import { emailOtpV2Resend } from "../../email-otp/domain/emailOtpV2Resend"
import { emailOtpV2SessionIsVerified } from "../../email-otp/domain/emailOtpV2SessionIsVerified"
import { emailOtpV2Start } from "../../email-otp/domain/emailOtpV2Start"
import { emailOtpV2Verify } from "../../email-otp/domain/emailOtpV2Verify"
import { identityProviderV2CallbackProcess } from "../../identity-provider/domain/identityProviderV2CallbackProcess"
import { identityProviderV2IntentStart } from "../../identity-provider/domain/identityProviderV2IntentStart"
import { identityProviderCallbackPayloadSchema } from "../../identity-provider/model/identityProviderCallbackPayloadSchema"
import { identityProviderStartPayloadSchema } from "../../identity-provider/model/identityProviderStartPayloadSchema"
import { mfaEnrollmentSkip } from "../../mfa/domain/mfaEnrollmentSkip"
import { mfaOptionsGet } from "../../mfa/domain/mfaOptionsGet"
import { mfaV2EmailOtpEnrollmentActivate } from "../../mfa/domain/mfaV2EmailOtpEnrollmentActivate"
import { mfaV2EmailOtpEnrollmentPrepare } from "../../mfa/domain/mfaV2EmailOtpEnrollmentPrepare"
import { mfaV2EmailOtpChallenge } from "../../mfa/domain/mfaV2EmailOtpChallenge"
import { mfaV2EmailOtpResend } from "../../mfa/domain/mfaV2EmailOtpResend"
import { mfaV2EmailOtpVerify } from "../../mfa/domain/mfaV2EmailOtpVerify"
import { mfaV2SmsOtpChallenge } from "../../mfa/domain/mfaV2SmsOtpChallenge"
import { mfaV2SmsOtpResend } from "../../mfa/domain/mfaV2SmsOtpResend"
import { mfaV2SmsOtpVerify } from "../../mfa/domain/mfaV2SmsOtpVerify"
import { mfaV2TotpEnrollmentStart } from "../../mfa/domain/mfaV2TotpEnrollmentStart"
import { mfaV2TotpEnrollmentVerify } from "../../mfa/domain/mfaV2TotpEnrollmentVerify"
import { mfaV2TotpVerify } from "../../mfa/domain/mfaV2TotpVerify"
import { mfaV2U2fChallenge } from "../../mfa/domain/mfaV2U2fChallenge"
import { mfaV2U2fVerify } from "../../mfa/domain/mfaV2U2fVerify"
import { mfaV2WebAuthnEnrollmentStart } from "../../mfa/domain/mfaV2WebAuthnEnrollmentStart"
import { mfaV2WebAuthnEnrollmentVerify } from "../../mfa/domain/mfaV2WebAuthnEnrollmentVerify"
import { mfaOptionsSchema } from "../../mfa/model/mfaOptionsSchema"
import { mfaEmailOtpEnrollmentRequestSchema } from "../../mfa/model/mfaEmailOtpEnrollmentRequestSchema"
import { mfaEmailOtpEnrollmentResponseSchema } from "../../mfa/model/mfaEmailOtpEnrollmentResponseSchema"
import { mfaOtpChallengeRequestSchema } from "../../mfa/model/mfaOtpChallengeRequestSchema"
import { mfaOtpVerifyRequestSchema } from "../../mfa/model/mfaOtpVerifyRequestSchema"
import { mfaPasskeyEnrollmentStartRequestSchema } from "../../mfa/model/mfaPasskeyEnrollmentStartRequestSchema"
import { mfaTotpEnrollmentStartRequestSchema } from "../../mfa/model/mfaTotpEnrollmentStartRequestSchema"
import { mfaTotpEnrollmentStartResponseSchema } from "../../mfa/model/mfaTotpEnrollmentStartResponseSchema"
import { mfaTotpEnrollmentVerifyRequestSchema } from "../../mfa/model/mfaTotpEnrollmentVerifyRequestSchema"
import { mfaTotpEnrollmentVerifyResponseSchema } from "../../mfa/model/mfaTotpEnrollmentVerifyResponseSchema"
import { mfaU2fChallengeRequestSchema } from "../../mfa/model/mfaU2fChallengeRequestSchema"
import { mfaU2fEnrollmentStartRequestSchema } from "../../mfa/model/mfaU2fEnrollmentStartRequestSchema"
import { mfaU2fVerifyRequestSchema } from "../../mfa/model/mfaU2fVerifyRequestSchema"
import { mfaWebAuthnEnrollmentStartResponseSchema } from "../../mfa/model/mfaWebAuthnEnrollmentStartResponseSchema"
import { mfaWebAuthnEnrollmentVerifyRequestSchema } from "../../mfa/model/mfaWebAuthnEnrollmentVerifyRequestSchema"
import { mfaWebAuthnEnrollmentVerifyResponseSchema } from "../../mfa/model/mfaWebAuthnEnrollmentVerifyResponseSchema"
import { passkeyV2ChallengeCreate } from "../../passkey/domain/passkeyV2ChallengeCreate"
import { passkeyV2Verify } from "../../passkey/domain/passkeyV2Verify"
import { passkeyChallengeRequestSchema } from "../../passkey/model/passkeyChallengeRequestSchema"
import { passkeyVerifyRequestSchema } from "../../passkey/model/passkeyVerifyRequestSchema"
import { passwordV2Verify } from "../../password/domain/passwordV2Verify"
import { passwordChangeRequiredExecute } from "../../password/domain/passwordChangeRequiredExecute"
import { passwordChangeRequiredRequestSchema } from "../../password/model/passwordChangeRequiredRequestSchema"
import { passwordChangeRequiredResponseSchema } from "../../password/model/passwordChangeRequiredResponseSchema"
import { passwordVerifyRequestSchema } from "../../password/model/passwordVerifyRequestSchema"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import { recentAccountCookieOpen } from "../../session/domain/recentAccountCookieOpen"
import { recentAccountCookieSeal } from "../../session/domain/recentAccountCookieSeal"
import { recentAccountCookieUpsert } from "../../session/domain/recentAccountCookieUpsert"
import { recentAccountDiscoveryExecute } from "../../session/domain/recentAccountDiscoveryExecute"
import { recentAccountSelectionExecute } from "../../session/domain/recentAccountSelectionExecute"
import type { RecentAccount, RecentAccountCookie } from "../../session/model/recentAccountCookieSchema"
import type { RecentAccountSummary } from "../../session/model/recentAccountSummarySchema"
import { sessionContinuePayloadSchema } from "../../session/model/sessionContinuePayloadSchema"
import { zitadelClientCreate } from "../../zitadel/zitadelClientCreate"
import { flowCallbackUrlIsOwned } from "../domain/flowCallbackUrlIsOwned"
import { flowV2CookieNameCreate } from "../domain/flowV2CookieNameCreate"
import { flowV2CookieOpen } from "../domain/flowV2CookieOpen"
import { flowV2CookieSeal } from "../domain/flowV2CookieSeal"
import type { FlowV2Cookie } from "../model/flowV2CookieSchema"
import type { FlowV2Transition } from "../model/flowV2TransitionSchema"
import { flowV2TransitionSchema } from "../model/flowV2TransitionSchema"

type AppEnvironment = { Bindings: WorkerBindingsInput }
type AppContext = Context<AppEnvironment>
type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
type Dependencies = {
  fetch: Fetch
  now: () => number
  randomBytes: (length: number) => Uint8Array
  logger: {
    warn: (event: string, context?: Record<string, number | string>) => void
    error: (event: string, context?: Record<string, number | string>) => void
  }
}

const handleSchema = v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{22}$/))
const initializePayloadSchema = v.strictObject({
  authRequest: v.pipe(v.string(), v.minLength(1), v.maxLength(200), v.regex(/^[A-Za-z0-9._~-]+$/)),
})
const startPayloadSchema = v.strictObject({
  email: v.pipe(v.string(), v.trim(), v.toLowerCase(), v.email(), v.maxLength(254)),
  csrfToken: v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{43}$/)),
})
const csrfPayloadSchema = v.strictObject({
  csrfToken: v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{43}$/)),
})
const verifyPayloadSchema = v.strictObject({
  code: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(20), v.regex(/^[A-Za-z0-9-]+$/)),
  csrfToken: v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{43}$/)),
})
function base64UrlEncode(value: Uint8Array): string {
  let binary = ""
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
}

function base64UrlDecode(value: string): Uint8Array {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (value.length % 4)) % 4)
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
}

function bytesCopy(value: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(value.byteLength)
  copy.set(value)
  return copy
}

function csrfTokenMatches(actual: string, expected: string): boolean {
  if (actual.length !== expected.length) return false
  let difference = 0
  for (let index = 0; index < actual.length; index += 1) {
    difference |= actual.charCodeAt(index) ^ expected.charCodeAt(index)
  }
  return difference === 0
}

function resultStatusGet(result: { success: boolean; rawData?: unknown }): number | undefined {
  if (result.success || typeof result.rawData !== "object" || result.rawData === null) return undefined
  if (!("status" in result.rawData) || typeof result.rawData.status !== "number") return undefined
  return result.rawData.status
}

function errorStatusGet(code: string): 400 | 401 | 403 | 404 | 409 | 415 | 429 | 500 | 502 | 503 {
  if (
    code === "origin_rejected" ||
    code === "csrf_rejected" ||
    code === "request_rejected" ||
    code === "provider_mismatch" ||
    code === "method_not_enrolled" ||
    code === "method_already_enrolled" ||
    code === "mfa_setup_forbidden" ||
    code === "mfa_skip_forbidden" ||
    code === "mfa_enrollment_not_allowed"
  )
    return 403
  if (code === "flow_unknown" || code === "idp_not_found") return 404
  if (code === "code_invalid" || code === "credentials_invalid" || code === "account_invalid") return 401
  if (code === "unsupported_media_type") return 415
  if (code === "rate_limited") return 429
  if (
    code === "flow_invalid" ||
    code === "flow_expired" ||
    code === "flow_replayed" ||
    code === "flow_stage_invalid" ||
    code === "session_stale" ||
    code === "challenge_expired" ||
    code === "fallback_forbidden"
  ) {
    return 409
  }
  if (code === "invalid_payload" || code === "invalid_query" || code === "too_many_flows") return 400
  if (code === "service_unavailable" || code === "rate_limiter_unavailable" || code === "provider_unavailable")
    return 503
  if (
    code === "password_unavailable" ||
    code === "passkey_unavailable" ||
    code === "challenge_unavailable" ||
    code === "authorization_unavailable" ||
    code === "mfa_unavailable" ||
    code === "enrollment_unavailable"
  ) {
    return 503
  }
  if (
    code === "idp_start_failed" ||
    code === "idp_redirect_invalid" ||
    code === "idp_intent_invalid" ||
    code === "idp_session_failed"
  )
    return 502
  return 502
}

function resultErrorResponse(c: AppContext, op: string, code: string) {
  const status = errorStatusGet(code)
  if (status === 429) c.header("Retry-After", "60")
  return c.json({ success: false, op, errorMessage: code }, status)
}

function transitionResponse(c: AppContext, transition: FlowV2Transition, status: 200 | 202 = 200) {
  const parsed = v.safeParse(flowV2TransitionSchema, transition)
  if (!parsed.success) return resultErrorResponse(c, "flowTransition", "service_unavailable")
  return c.json(resultCreate(parsed.output), status)
}

function cookiesGet(header: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>()
  if (!header || header.length > 16_384) return cookies
  for (const part of header.split(";")) {
    const [name, ...value] = part.trim().split("=")
    if (name) cookies.set(name, value.join("="))
  }
  return cookies
}

function cookieHeaderCreate(name: string, value: string, maxAge: number): string {
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`
}

const recentAccountCookieName = "__Host-zitadel-login-accounts"
const recentAccountCookieLifetimeSeconds = 30 * 24 * 60 * 60

type ContinuationSession = {
  id: string
  expirationDate?: string
  factors?: {
    user?: { id: string; organizationId: string }
    password?: { verifiedAt?: string }
    otpEmail?: { verifiedAt?: string }
    webAuthN?: { verifiedAt?: string }
  }
}

function recentAccountCookieValueGet(c: AppContext): string | undefined {
  return cookiesGet(c.req.header("cookie")).get(recentAccountCookieName)
}

function timestampParse(value: string | undefined): number | undefined {
  if (!value) return undefined
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return undefined
  return Math.floor(timestamp / 1000)
}

function recentAccountFromContinuationCreate(
  state: Extract<FlowV2Cookie, { stage: "verified" }>,
  session: ContinuationSession,
  now: number,
): RecentAccount | undefined {
  const user = session.factors?.user
  if (
    !user ||
    user.id !== state.userId ||
    user.organizationId !== state.organizationId ||
    session.id !== state.sessionId
  ) {
    return undefined
  }
  const authAt = Math.max(
    state.issuedAt,
    timestampParse(session.factors?.password?.verifiedAt) ?? 0,
    timestampParse(session.factors?.otpEmail?.verifiedAt) ?? 0,
    timestampParse(session.factors?.webAuthN?.verifiedAt) ?? 0,
  )
  const nativeExpiresAt = timestampParse(session.expirationDate)
  const expiresAt = Math.min(
    nativeExpiresAt ?? now + recentAccountCookieLifetimeSeconds,
    now + recentAccountCookieLifetimeSeconds,
  )
  if (expiresAt <= now) return undefined
  return {
    userId: state.userId,
    sessionId: state.sessionId,
    sessionToken: state.sessionToken,
    organizationId: state.organizationId,
    authAt,
    lastUsedAt: now,
    expiresAt,
  }
}

function flowHandleQueryGet(c: AppContext) {
  const url = new URL(c.req.url)
  if ([...url.searchParams.keys()].some((key) => key !== "flow"))
    return resultErrorCreate("flowHandleQueryGet", "invalid_query")
  const values = url.searchParams.getAll("flow")
  if (values.length !== 1) return resultErrorCreate("flowHandleQueryGet", "invalid_query")
  const parsed = v.safeParse(handleSchema, values[0])
  if (!parsed.success) return resultErrorCreate("flowHandleQueryGet", "invalid_query")
  return resultCreate(parsed.output)
}

function callbackFlowHandleGet(c: AppContext) {
  const url = new URL(c.req.url)
  const values = url.searchParams.getAll("flow")
  if (values.length !== 1) return resultErrorCreate("callbackFlowHandleGet", "invalid_query")
  const parsed = v.safeParse(handleSchema, values[0])
  if (!parsed.success) return resultErrorCreate("callbackFlowHandleGet", "invalid_query")
  return resultCreate(parsed.output)
}

async function payloadParse<T>(c: AppContext, schema: v.GenericSchema<unknown, T>, maximumLength = 4096) {
  const op = "payloadParse"
  if (!c.req.header("content-type")?.toLowerCase().startsWith("application/json")) {
    return resultErrorCreate(op, "unsupported_media_type")
  }
  const length = Number(c.req.header("content-length") ?? "0")
  if (!Number.isFinite(length) || length > maximumLength) return resultErrorCreate(op, "invalid_payload")
  try {
    const text = await c.req.text()
    if (text.length > maximumLength) return resultErrorCreate(op, "invalid_payload")
    const parsed = v.safeParse(schema, JSON.parse(text))
    if (!parsed.success) return resultErrorCreate(op, "invalid_payload")
    return resultCreate(parsed.output)
  } catch {
    return resultErrorCreate(op, "invalid_payload")
  }
}

async function abuseKeyCreate(scope: string, value: string, keyValue: string) {
  const op = "abuseKeyCreate"
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      bytesCopy(base64UrlDecode(keyValue)),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    )
    const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${scope}\u0000${value}`))
    return resultCreate(`${scope}:${base64UrlEncode(new Uint8Array(signed))}`)
  } catch {
    return resultErrorCreate(op, "rate_limiter_unavailable")
  }
}

async function abuseLimitCheck(
  rateLimiter: WorkerRateLimiter,
  cookieKey: string,
  scope: string,
  values: Array<[string, string]>,
) {
  const op = "abuseLimitCheck"
  for (const [name, value] of values) {
    const key = await abuseKeyCreate(`${scope}:${name}`, value, cookieKey)
    if (!key.success) return key
    try {
      const outcome = await rateLimiter.limit({ key: key.data })
      if (!outcome.success) return resultErrorCreate(op, "rate_limited")
    } catch {
      return resultErrorCreate(op, "rate_limiter_unavailable")
    }
  }
  return resultCreate(undefined)
}

function authRequestRedirectIsValid(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.username || url.password || url.hash) return false
    return url.protocol === "https:" || (url.protocol === "http:" && url.hostname === "localhost")
  } catch {
    return false
  }
}

function stateTransitionGet(
  state: FlowV2Cookie,
  bindings: WorkerBindings,
  recentAccounts?: RecentAccountSummary[],
): FlowV2Transition {
  if (state.stage === "silent" || state.stage === "verified") {
    return { kind: "complete", path: `/api/v2/flow/continue?flow=${state.flowHandle}` }
  }
  if (state.stage === "otp" || state.stage === "otp_decoy") {
    return {
      kind: "render",
      route: `/login/email-otp?flow=${state.flowHandle}`,
      screen: { name: "email_otp_code" },
      csrfToken: state.csrfToken,
    }
  }
  if (state.stage === "mfa") {
    return {
      kind: "render",
      route: `/login/mfa?flow=${state.flowHandle}`,
      screen: { name: "mfa", factors: state.mfaMethods },
      csrfToken: state.csrfToken,
    }
  }
  if (state.stage === "password_change_required") {
    return {
      kind: "render",
      route: `/login/password?flow=${state.flowHandle}`,
      screen: { name: "password_change_required", expired: state.expired },
      csrfToken: state.csrfToken,
    }
  }
  if (state.stage === "password_changed") {
    return { kind: "fallback", path: `/api/v2/flow/fallback?flow=${state.flowHandle}` }
  }
  if (state.stage === "mfa_email_otp_code") {
    return {
      kind: "render",
      route: `/login/mfa?flow=${state.flowHandle}`,
      screen: { name: "mfa_email_otp_code", challengeIssued: state.challengeIssuedAt !== undefined },
      csrfToken: state.csrfToken,
    }
  }
  if (state.stage === "mfa_totp_setup") {
    return {
      kind: "render",
      route: `/login/mfa?flow=${state.flowHandle}`,
      screen: { name: "mfa_totp_setup" },
      csrfToken: state.csrfToken,
    }
  }
  if (state.stage === "mfa_webauthn_setup") {
    return {
      kind: "render",
      route: `/login/mfa?flow=${state.flowHandle}`,
      screen: { name: "mfa_webauthn_setup", method: state.registrationMethod },
      csrfToken: state.csrfToken,
    }
  }
  if (state.stage === "passkey") {
    return {
      kind: "render",
      route: `/login/passkey?flow=${state.flowHandle}`,
      screen: { name: "passkey", options: state.options },
      csrfToken: state.csrfToken,
    }
  }
  if (state.stage === "idp_unlinked") {
    return {
      kind: "render",
      route: `/login/idp/${encodeURIComponent(state.idpId)}/account-not-found?flow=${state.flowHandle}`,
      screen: { name: "idp_account_not_found" },
      csrfToken: state.csrfToken,
    }
  }
  if (
    state.stage !== "ready" ||
    !state.owned ||
    !bindings.ZITADEL_LOGIN_V2_ENABLED ||
    !bindings.ZITADEL_EMAIL_OTP_V2_ENABLED
  ) {
    return { kind: "fallback", path: `/api/v2/flow/fallback?flow=${state.flowHandle}` }
  }
  return {
    kind: "render",
    route: `/login/email-otp?flow=${state.flowHandle}`,
    screen: {
      name: "email_otp_start",
      ...(state.loginHint ? { loginHint: state.loginHint } : {}),
      ...(recentAccounts && recentAccounts.length > 0 ? { recentAccounts } : {}),
    },
    csrfToken: state.csrfToken,
  }
}

export function flowV2RouterCreate(dependencies: Dependencies) {
  const app = new Hono<AppEnvironment>()

  function bindingsGet(c: AppContext) {
    return workerBindingsParse(c.env)
  }

  function requestBoundaryCheck(c: AppContext, bindings: WorkerBindings, mutation: boolean) {
    if (new URL(c.req.url).origin !== bindings.PAGES_ORIGIN)
      return resultErrorCreate("requestBoundaryCheck", "origin_rejected")
    if (mutation && c.req.header("origin") !== bindings.PAGES_ORIGIN) {
      return resultErrorCreate("requestBoundaryCheck", "origin_rejected")
    }
    return resultCreate(undefined)
  }

  async function stateSet(c: AppContext, bindings: WorkerBindings, state: FlowV2Cookie) {
    const sealed = await flowV2CookieSeal(state, bindings.FLOW_COOKIE_KEY, dependencies.randomBytes(12))
    if (!sealed.success) return sealed
    const name = flowV2CookieNameCreate(state.flowHandle)
    c.header("Set-Cookie", cookieHeaderCreate(name, sealed.data, Math.max(0, state.expiresAt - dependencies.now())), {
      append: true,
    })
    return resultCreate(undefined)
  }

  function stateClear(c: AppContext, flowHandle: string) {
    c.header("Set-Cookie", cookieHeaderCreate(flowV2CookieNameCreate(flowHandle), "", 0))
  }

  async function stateGet(c: AppContext, bindings: WorkerBindings, flowHandle: string) {
    const value = cookiesGet(c.req.header("cookie")).get(flowV2CookieNameCreate(flowHandle))
    if (!value) return resultErrorCreate("stateGet", "flow_unknown")
    const keys = [
      bindings.FLOW_COOKIE_KEY,
      ...(bindings.FLOW_COOKIE_PREVIOUS_KEY ? [bindings.FLOW_COOKIE_PREVIOUS_KEY] : []),
    ]
    return flowV2CookieOpen(value, flowHandle, keys, dependencies.now())
  }

  async function recentAccountCookieSet(c: AppContext, bindings: WorkerBindings, account: RecentAccount, now: number) {
    const op = "recentAccountCookieSet"
    if (!bindings.ZITADEL_RECENT_ACCOUNT_V2_ENABLED || !bindings.RECENT_ACCOUNT_COOKIE_KEY)
      return resultCreate(undefined)

    let existing: RecentAccountCookie | undefined
    const value = recentAccountCookieValueGet(c)
    if (value) {
      const keys = [
        bindings.RECENT_ACCOUNT_COOKIE_KEY,
        ...(bindings.RECENT_ACCOUNT_COOKIE_PREVIOUS_KEY ? [bindings.RECENT_ACCOUNT_COOKIE_PREVIOUS_KEY] : []),
      ]
      const opened = await recentAccountCookieOpen(value, keys, now)
      if (opened.success) existing = opened.data
    }

    const updated = recentAccountCookieUpsert(existing, account, now)
    const sealed = await recentAccountCookieSeal(
      updated,
      bindings.RECENT_ACCOUNT_COOKIE_KEY,
      dependencies.randomBytes(12),
    )
    if (!sealed.success) return resultErrorCreate(op, "recent_account_unavailable")
    c.header(
      "Set-Cookie",
      cookieHeaderCreate(recentAccountCookieName, sealed.data, Math.max(0, updated.expiresAt - now)),
      { append: true },
    )
    return resultCreate(undefined)
  }

  async function recentAccountsDiscover(c: AppContext, bindings: WorkerBindings, state: FlowV2Cookie, now: number) {
    if (!bindings.ZITADEL_RECENT_ACCOUNT_V2_ENABLED || !bindings.RECENT_ACCOUNT_COOKIE_KEY) return undefined
    const cookieKeys = [
      bindings.RECENT_ACCOUNT_COOKIE_KEY,
      ...(bindings.RECENT_ACCOUNT_COOKIE_PREVIOUS_KEY ? [bindings.RECENT_ACCOUNT_COOKIE_PREVIOUS_KEY] : []),
    ]
    const discovery = await recentAccountDiscoveryExecute({
      cookieValue: recentAccountCookieValueGet(c),
      cookieKeys,
      organizationId: state.organizationId,
      prompt: state.prompt,
      loginHint: state.loginHint,
      hintUserId: state.hintUserId,
      maxAgeSeconds: state.maxAgeSeconds,
      now,
      randomBytes: dependencies.randomBytes,
      client: zitadelClientCreate(bindings, dependencies.fetch),
    })
    if (!discovery.success) return undefined
    if (discovery.data.updatedCookieValue) {
      c.header(
        "Set-Cookie",
        cookieHeaderCreate(
          recentAccountCookieName,
          discovery.data.updatedCookieValue,
          recentAccountCookieLifetimeSeconds,
        ),
        { append: true },
      )
    } else if (discovery.data.clearCookie) {
      c.header("Set-Cookie", cookieHeaderCreate(recentAccountCookieName, "", 0), { append: true })
    }
    return discovery.data.accounts
  }

  async function authRequestRevalidate(bindings: WorkerBindings, state: FlowV2Cookie) {
    const result = await zitadelClientCreate(bindings, dependencies.fetch).authRequestGet(state.authRequestId)
    if (!result.success)
      return resultErrorCreate("authRequestRevalidate", "flow_replayed", { status: resultStatusGet(result) })
    const request = result.data.authRequest
    if (
      request.id !== state.authRequestId ||
      request.clientId !== state.clientId ||
      request.redirectUri !== state.redirectUri ||
      !bindings.ZITADEL_ALLOWED_CLIENT_IDS.includes(request.clientId)
    ) {
      return resultErrorCreate("authRequestRevalidate", "flow_invalid")
    }
    return resultCreate(request)
  }

  async function mutationStateGet<Stage extends "ready" | "otp" | "otp_decoy" | "passkey">(
    c: AppContext,
    bindings: WorkerBindings,
    expectedStages: readonly Stage[],
  ) {
    const handle = flowHandleQueryGet(c)
    if (!handle.success) return handle
    const state = await stateGet(c, bindings, handle.data)
    if (!state.success) return state
    if (!expectedStages.includes(state.data.stage as Stage)) {
      return resultErrorCreate("mutationStateGet", "flow_stage_invalid")
    }
    return resultCreate(state.data as Extract<FlowV2Cookie, { stage: Stage }>)
  }

  app.post("/api/v2/flow/initialize", async (c) => {
    const op = "flowInitialize"
    const bindings = bindingsGet(c)
    if (!bindings.success) return resultErrorResponse(c, op, "service_unavailable")
    const boundary = requestBoundaryCheck(c, bindings.data, true)
    if (!boundary.success) return resultErrorResponse(c, op, boundary.errorMessage)
    const payload = await payloadParse(c, initializePayloadSchema)
    if (!payload.success) return resultErrorResponse(c, op, payload.errorMessage)
    const activeFlowCount = [...cookiesGet(c.req.header("cookie")).keys()].filter((name) =>
      name.startsWith("__Host-zitadel-login-flow-"),
    ).length
    if (activeFlowCount >= 3) return resultErrorResponse(c, op, "too_many_flows")
    const limited = await abuseLimitCheck(bindings.data.RATE_LIMITER, bindings.data.FLOW_COOKIE_KEY, "v2-flow-init", [
      ["request", payload.data.authRequest],
      ["ip", c.req.header("cf-connecting-ip") ?? "unknown"],
    ])
    if (!limited.success) return resultErrorResponse(c, op, limited.errorMessage)

    const auth = await zitadelClientCreate(bindings.data, dependencies.fetch).authRequestGet(payload.data.authRequest)
    if (!auth.success) {
      dependencies.logger.warn("v2_flow_auth_request_rejected", { status: resultStatusGet(auth) ?? 0 })
      return resultErrorResponse(c, op, "request_rejected")
    }
    const request = auth.data.authRequest
    if (
      request.id !== payload.data.authRequest ||
      !bindings.data.ZITADEL_ALLOWED_CLIENT_IDS.includes(request.clientId) ||
      !authRequestRedirectIsValid(request.redirectUri)
    ) {
      return resultErrorResponse(c, op, "request_rejected")
    }

    const ownOrganizationScope = `urn:zitadel:iam:org:id:${bindings.data.ZITADEL_ORGANIZATION_ID}`
    const unsupportedScope = request.scope.some(
      (scope) =>
        (scope.startsWith("urn:zitadel:iam:org:id:") && scope !== ownOrganizationScope) ||
        scope.startsWith("urn:zitadel:iam:org:domain:") ||
        scope.startsWith("urn:zitadel:iam:org:idp:id:"),
    )
    const unsupportedPrompt =
      request.prompt.some(
        (prompt) =>
          prompt === "PROMPT_CREATE" ||
          prompt === "PROMPT_CONSENT" ||
          (prompt === "PROMPT_SELECT_ACCOUNT" && !bindings.data.ZITADEL_RECENT_ACCOUNT_V2_ENABLED),
      ) || new Set(request.prompt).size !== request.prompt.length
    const silent = request.prompt.includes("PROMPT_NONE")
    if (silent && request.prompt.length !== 1) return resultErrorResponse(c, op, "request_rejected")
    const owned =
      !unsupportedScope &&
      !unsupportedPrompt &&
      bindings.data.ZITADEL_LOGIN_V2_ENABLED &&
      bindings.data.ZITADEL_EMAIL_OTP_V2_ENABLED
    const now = dependencies.now()
    const base = {
      version: 2 as const,
      flowHandle: base64UrlEncode(dependencies.randomBytes(16)),
      requestKind: "oidc" as const,
      authRequestId: request.id,
      clientId: request.clientId,
      redirectUri: request.redirectUri,
      organizationId: bindings.data.ZITADEL_ORGANIZATION_ID,
      prompt: request.prompt,
      ...(request.maxAge !== undefined ? { maxAgeSeconds: request.maxAge } : {}),
      ...(request.loginHint ? { loginHint: request.loginHint } : {}),
      ...(request.hintUserId ? { hintUserId: request.hintUserId } : {}),
      csrfToken: base64UrlEncode(dependencies.randomBytes(32)),
      issuedAt: now,
      expiresAt: now + bindings.data.SESSION_LIFETIME_SECONDS,
      transitionCounter: 0,
    }
    const state: FlowV2Cookie = silent
      ? { ...base, stage: "silent", delegable: false }
      : { ...base, stage: "ready", delegable: true, owned }
    const set = await stateSet(c, bindings.data, state)
    if (!set.success) return resultErrorResponse(c, op, "service_unavailable")
    let discoveredAccounts: RecentAccountSummary[] | undefined
    if (state.stage === "ready" && state.owned) {
      discoveredAccounts = await recentAccountsDiscover(c, bindings.data, state, now)
    }
    return transitionResponse(c, stateTransitionGet(state, bindings.data, discoveredAccounts))
  })

  app.get("/api/v2/flow/resume", async (c) => {
    const op = "flowResume"
    const bindings = bindingsGet(c)
    if (!bindings.success) return resultErrorResponse(c, op, "service_unavailable")
    const boundary = requestBoundaryCheck(c, bindings.data, false)
    if (!boundary.success) return resultErrorResponse(c, op, boundary.errorMessage)
    const handle = flowHandleQueryGet(c)
    if (!handle.success) return resultErrorResponse(c, op, handle.errorMessage)
    const state = await stateGet(c, bindings.data, handle.data)
    if (!state.success) {
      if (state.errorMessage !== "flow_unknown") stateClear(c, handle.data)
      return resultErrorResponse(c, op, state.errorMessage)
    }
    const request = await authRequestRevalidate(bindings.data, state.data)
    if (!request.success) {
      stateClear(c, handle.data)
      return resultErrorResponse(c, op, request.errorMessage)
    }
    const now = dependencies.now()
    let discoveredAccounts: RecentAccountSummary[] | undefined
    if (state.data.stage === "ready" && state.data.owned) {
      discoveredAccounts = await recentAccountsDiscover(c, bindings.data, state.data, now)
    }
    return transitionResponse(c, stateTransitionGet(state.data, bindings.data, discoveredAccounts))
  })

  app.get("/api/v2/session/accounts", async (c) => {
    const op = "sessionAccountsGet"
    const bindings = bindingsGet(c)
    if (!bindings.success) return resultErrorResponse(c, op, "service_unavailable")
    const boundary = requestBoundaryCheck(c, bindings.data, false)
    if (!boundary.success) return resultErrorResponse(c, op, boundary.errorMessage)
    const handle = flowHandleQueryGet(c)
    if (!handle.success) return resultErrorResponse(c, op, handle.errorMessage)
    const state = await stateGet(c, bindings.data, handle.data)
    if (!state.success) return resultErrorResponse(c, op, state.errorMessage)
    const request = await authRequestRevalidate(bindings.data, state.data)
    if (!request.success) {
      stateClear(c, handle.data)
      return resultErrorResponse(c, op, request.errorMessage)
    }

    const now = dependencies.now()
    const accounts = (await recentAccountsDiscover(c, bindings.data, state.data, now)) ?? []
    return c.json(resultCreate({ accounts }), 200)
  })

  app.get("/api/v2/mfa/options", async (c) => {
    const op = "mfaOptions"
    const bindings = bindingsGet(c)
    if (!bindings.success) return resultErrorResponse(c, op, "service_unavailable")
    const boundary = requestBoundaryCheck(c, bindings.data, false)
    if (!boundary.success) return resultErrorResponse(c, op, boundary.errorMessage)
    const handle = flowHandleQueryGet(c)
    if (!handle.success) return resultErrorResponse(c, op, handle.errorMessage)
    const state = await stateGet(c, bindings.data, handle.data)
    if (!state.success) return resultErrorResponse(c, op, state.errorMessage)
    if (state.data.stage !== "mfa" && state.data.stage !== "mfa_email_otp_code") {
      return resultErrorResponse(c, op, "flow_stage_invalid")
    }
    const request = await authRequestRevalidate(bindings.data, state.data)
    if (!request.success) return resultErrorResponse(c, op, request.errorMessage)
    if (!bindings.data.ZITADEL_LOGIN_V2_ENABLED || !bindings.data.ZITADEL_MFA_V2_ENABLED) {
      const options = v.safeParse(mfaOptionsSchema, { mode: "fallback", reason: "unsupported_branch" })
      if (!options.success) return resultErrorResponse(c, op, "service_unavailable")
      return c.json(resultCreate(options.output), 200)
    }

    const mfaState: Extract<FlowV2Cookie, { stage: "mfa" }> =
      state.data.stage === "mfa"
        ? state.data
        : (({ enrollmentActivationConsumedAt: _consumed, challengeIssuedAt: _issued, ...stateBase }) => ({
            ...stateBase,
            stage: "mfa" as const,
          }))(state.data)
    const result = await mfaOptionsGet({
      state: mfaState,
      now: dependencies.now(),
      client: zitadelClientCreate(bindings.data, dependencies.fetch),
    })
    if (!result.success) return resultErrorResponse(c, op, result.errorMessage)
    const options = v.safeParse(mfaOptionsSchema, result.data.options)
    if (!options.success) return resultErrorResponse(c, op, "service_unavailable")
    if (result.data.state.sessionToken !== state.data.sessionToken) {
      const updatedState = { ...state.data, sessionToken: result.data.state.sessionToken }
      const set = await stateSet(c, bindings.data, updatedState)
      if (!set.success) return resultErrorResponse(c, op, "service_unavailable")
    }
    return c.json(resultCreate(options.output), 200)
  })

  app.post("/api/v2/mfa/skip", async (c) => {
    const op = "mfaSkip"
    const bindings = bindingsGet(c)
    if (!bindings.success) return resultErrorResponse(c, op, "service_unavailable")
    const boundary = requestBoundaryCheck(c, bindings.data, true)
    if (!boundary.success) return resultErrorResponse(c, op, boundary.errorMessage)
    const payload = await payloadParse(c, csrfPayloadSchema)
    if (!payload.success) return resultErrorResponse(c, op, payload.errorMessage)
    const handle = flowHandleQueryGet(c)
    if (!handle.success) return resultErrorResponse(c, op, handle.errorMessage)
    const state = await stateGet(c, bindings.data, handle.data)
    if (!state.success) return resultErrorResponse(c, op, state.errorMessage)
    if (state.data.stage === "verified" || state.data.stage === "silent") {
      return resultErrorResponse(c, op, "flow_replayed")
    }
    if (state.data.stage !== "mfa") return resultErrorResponse(c, op, "flow_stage_invalid")
    if (!csrfTokenMatches(payload.data.csrfToken, state.data.csrfToken)) {
      return resultErrorResponse(c, op, "csrf_rejected")
    }
    const limited = await abuseLimitCheck(bindings.data.RATE_LIMITER, bindings.data.FLOW_COOKIE_KEY, "v2-mfa-skip", [
      ["flow", state.data.flowHandle],
      ["session", state.data.sessionId],
      ["ip", c.req.header("cf-connecting-ip") ?? "unknown"],
    ])
    if (!limited.success) return resultErrorResponse(c, op, limited.errorMessage)
    const request = await authRequestRevalidate(bindings.data, state.data)
    if (!request.success) return resultErrorResponse(c, op, request.errorMessage)
    if (!bindings.data.ZITADEL_LOGIN_V2_ENABLED || !bindings.data.ZITADEL_MFA_V2_ENABLED) {
      return resultErrorResponse(c, op, "mfa_skip_forbidden")
    }

    const result = await mfaEnrollmentSkip({
      state: state.data,
      now: dependencies.now(),
      client: zitadelClientCreate(bindings.data, dependencies.fetch),
    })
    if (!result.success) {
      dependencies.logger.error("v2_mfa_skip_failed", { status: resultStatusGet(result) ?? 0 })
      return resultErrorResponse(c, op, result.errorMessage)
    }
    const set = await stateSet(c, bindings.data, result.data.state)
    if (!set.success) return resultErrorResponse(c, op, "service_unavailable")
    return transitionResponse(c, result.data.transition)
  })

  app.post("/api/v2/mfa/email-otp/enroll", async (c) => {
    const op = "mfaEmailOtpEnrollment"
    const bindings = bindingsGet(c)
    if (!bindings.success) return resultErrorResponse(c, op, "service_unavailable")
    const boundary = requestBoundaryCheck(c, bindings.data, true)
    if (!boundary.success) return resultErrorResponse(c, op, boundary.errorMessage)
    const payload = await payloadParse(c, mfaEmailOtpEnrollmentRequestSchema)
    if (!payload.success) return resultErrorResponse(c, op, payload.errorMessage)
    const handle = flowHandleQueryGet(c)
    if (!handle.success) return resultErrorResponse(c, op, handle.errorMessage)
    const stored = await stateGet(c, bindings.data, handle.data)
    if (!stored.success) return resultErrorResponse(c, op, stored.errorMessage)
    if (
      stored.data.stage === "mfa_email_otp_code" ||
      stored.data.stage === "verified" ||
      stored.data.stage === "silent"
    ) {
      return resultErrorResponse(c, op, "flow_replayed")
    }
    if (stored.data.stage !== "mfa") return resultErrorResponse(c, op, "flow_stage_invalid")
    if (!csrfTokenMatches(payload.data.csrfToken, stored.data.csrfToken)) {
      return resultErrorResponse(c, op, "csrf_rejected")
    }
    const limited = await abuseLimitCheck(
      bindings.data.RATE_LIMITER,
      bindings.data.FLOW_COOKIE_KEY,
      "v2-mfa-email-otp-enroll",
      [
        ["flow", stored.data.flowHandle],
        ["session", stored.data.sessionId],
        ["ip", c.req.header("cf-connecting-ip") ?? "unknown"],
      ],
    )
    if (!limited.success) return resultErrorResponse(c, op, limited.errorMessage)
    const request = await authRequestRevalidate(bindings.data, stored.data)
    if (!request.success) return resultErrorResponse(c, op, request.errorMessage)
    if (!bindings.data.ZITADEL_LOGIN_V2_ENABLED || !bindings.data.ZITADEL_MFA_V2_ENABLED) {
      return resultErrorResponse(c, op, "mfa_enrollment_not_allowed")
    }

    const client = zitadelClientCreate(bindings.data, dependencies.fetch)
    const prepared = await mfaV2EmailOtpEnrollmentPrepare({
      state: stored.data,
      now: dependencies.now(),
      client,
    })
    if (!prepared.success) {
      dependencies.logger.error("v2_mfa_email_otp_enrollment_prepare_failed", {
        status: resultStatusGet(prepared) ?? 0,
      })
      return resultErrorResponse(c, op, prepared.errorMessage)
    }

    // Seal the consumed activation state before the first non-idempotent native call.
    const consumed = await stateSet(c, bindings.data, prepared.data.state)
    if (!consumed.success) return resultErrorResponse(c, op, "service_unavailable")

    const activated = await mfaV2EmailOtpEnrollmentActivate({
      state: prepared.data.state,
      now: dependencies.now(),
      client,
    })
    if (!activated.success) return resultErrorResponse(c, op, "enrollment_unavailable")
    const response = v.safeParse(mfaEmailOtpEnrollmentResponseSchema, {
      transition: activated.data.transition,
    })
    if (!response.success) return resultErrorResponse(c, op, "service_unavailable")
    const set = await stateSet(c, bindings.data, activated.data.state)
    if (!set.success) return resultErrorResponse(c, op, "service_unavailable")
    return c.json(resultCreate(response.output), 201)
  })

  app.post("/api/v2/mfa/otp/enroll", async (c) => {
    const op = "mfaTotpEnrollmentStart"
    const bindings = bindingsGet(c)
    if (!bindings.success) return resultErrorResponse(c, op, "service_unavailable")
    const boundary = requestBoundaryCheck(c, bindings.data, true)
    if (!boundary.success) return resultErrorResponse(c, op, boundary.errorMessage)
    const payload = await payloadParse(c, mfaTotpEnrollmentStartRequestSchema)
    if (!payload.success) return resultErrorResponse(c, op, payload.errorMessage)
    const handle = flowHandleQueryGet(c)
    if (!handle.success) return resultErrorResponse(c, op, handle.errorMessage)
    const state = await stateGet(c, bindings.data, handle.data)
    if (!state.success) return resultErrorResponse(c, op, state.errorMessage)
    if (state.data.stage === "mfa_totp_setup" || state.data.stage === "verified" || state.data.stage === "silent") {
      return resultErrorResponse(c, op, "flow_replayed")
    }
    if (state.data.stage !== "mfa") return resultErrorResponse(c, op, "flow_stage_invalid")
    if (!csrfTokenMatches(payload.data.csrfToken, state.data.csrfToken)) {
      return resultErrorResponse(c, op, "csrf_rejected")
    }
    const limited = await abuseLimitCheck(
      bindings.data.RATE_LIMITER,
      bindings.data.FLOW_COOKIE_KEY,
      "v2-mfa-totp-enroll",
      [
        ["flow", state.data.flowHandle],
        ["session", state.data.sessionId],
        ["ip", c.req.header("cf-connecting-ip") ?? "unknown"],
      ],
    )
    if (!limited.success) return resultErrorResponse(c, op, limited.errorMessage)
    const request = await authRequestRevalidate(bindings.data, state.data)
    if (!request.success) return resultErrorResponse(c, op, request.errorMessage)
    if (!bindings.data.ZITADEL_LOGIN_V2_ENABLED || !bindings.data.ZITADEL_MFA_V2_ENABLED) {
      return resultErrorResponse(c, op, "mfa_enrollment_not_allowed")
    }

    const result = await mfaV2TotpEnrollmentStart({
      state: state.data,
      now: dependencies.now(),
      client: zitadelClientCreate(bindings.data, dependencies.fetch),
    })
    if (!result.success) {
      dependencies.logger.error("v2_mfa_totp_enrollment_start_failed", {
        status: resultStatusGet(result) ?? 0,
      })
      return resultErrorResponse(c, op, result.errorMessage)
    }
    const set = await stateSet(c, bindings.data, result.data.state)
    if (!set.success) return resultErrorResponse(c, op, "service_unavailable")
    const response = v.safeParse(mfaTotpEnrollmentStartResponseSchema, {
      provisioningUri: result.data.provisioningUri,
      secret: result.data.secret,
      transition: result.data.transition,
    })
    if (!response.success) return resultErrorResponse(c, op, "service_unavailable")
    return c.json(resultCreate(response.output), 201)
  })

  const mfaWebAuthnEnrollmentStartHandler = async (c: AppContext) => {
    const path = c.req.path
    const method = path.includes("/passkey/") ? ("passkey" as const) : ("u2f" as const)
    const op = method === "passkey" ? "mfaPasskeyEnrollmentStart" : "mfaU2fEnrollmentStart"
    const bindings = bindingsGet(c)
    if (!bindings.success) return resultErrorResponse(c, op, "service_unavailable")
    const boundary = requestBoundaryCheck(c, bindings.data, true)
    if (!boundary.success) return resultErrorResponse(c, op, boundary.errorMessage)
    const payload =
      method === "passkey"
        ? await payloadParse(c, mfaPasskeyEnrollmentStartRequestSchema)
        : await payloadParse(c, mfaU2fEnrollmentStartRequestSchema)
    if (!payload.success) return resultErrorResponse(c, op, payload.errorMessage)
    const handle = flowHandleQueryGet(c)
    if (!handle.success) return resultErrorResponse(c, op, handle.errorMessage)
    const state = await stateGet(c, bindings.data, handle.data)
    if (!state.success) return resultErrorResponse(c, op, state.errorMessage)
    if (
      state.data.stage === "mfa_webauthn_setup" ||
      state.data.stage === "mfa_totp_setup" ||
      state.data.stage === "verified" ||
      state.data.stage === "silent"
    ) {
      return resultErrorResponse(c, op, "flow_replayed")
    }
    if (state.data.stage !== "mfa") return resultErrorResponse(c, op, "flow_stage_invalid")
    if (!csrfTokenMatches(payload.data.csrfToken, state.data.csrfToken)) {
      return resultErrorResponse(c, op, "csrf_rejected")
    }
    const limited = await abuseLimitCheck(
      bindings.data.RATE_LIMITER,
      bindings.data.FLOW_COOKIE_KEY,
      `v2-mfa-${method}-enroll`,
      [
        ["flow", state.data.flowHandle],
        ["session", state.data.sessionId],
        ["ip", c.req.header("cf-connecting-ip") ?? "unknown"],
      ],
    )
    if (!limited.success) return resultErrorResponse(c, op, limited.errorMessage)
    const request = await authRequestRevalidate(bindings.data, state.data)
    if (!request.success) return resultErrorResponse(c, op, request.errorMessage)
    if (!bindings.data.ZITADEL_LOGIN_V2_ENABLED || !bindings.data.ZITADEL_MFA_V2_ENABLED) {
      return resultErrorResponse(c, op, "mfa_enrollment_not_allowed")
    }

    const result = await mfaV2WebAuthnEnrollmentStart({
      state: state.data,
      method,
      rpId: new URL(bindings.data.PAGES_ORIGIN).hostname,
      origin: bindings.data.PAGES_ORIGIN,
      now: dependencies.now(),
      client: zitadelClientCreate(bindings.data, dependencies.fetch),
    })
    if (!result.success) {
      dependencies.logger.error(`v2_mfa_${method}_enrollment_start_failed`, {
        status: resultStatusGet(result) ?? 0,
      })
      return resultErrorResponse(c, op, result.errorMessage)
    }
    const response = v.safeParse(mfaWebAuthnEnrollmentStartResponseSchema, {
      options: result.data.options,
      transition: result.data.transition,
    })
    if (!response.success) return resultErrorResponse(c, op, "service_unavailable")
    const set = await stateSet(c, bindings.data, result.data.state)
    if (!set.success) return resultErrorResponse(c, op, "service_unavailable")
    return c.json(resultCreate(response.output), 201)
  }

  app.post("/api/v2/mfa/u2f/enroll", mfaWebAuthnEnrollmentStartHandler)
  app.post("/api/v2/mfa/passkey/enroll", mfaWebAuthnEnrollmentStartHandler)

  const mfaWebAuthnEnrollmentVerifyHandler = async (c: AppContext) => {
    const method = c.req.path.includes("/passkey/") ? ("passkey" as const) : ("u2f" as const)
    const op = method === "passkey" ? "mfaPasskeyEnrollmentVerify" : "mfaU2fEnrollmentVerify"
    const bindings = bindingsGet(c)
    if (!bindings.success) return resultErrorResponse(c, op, "service_unavailable")
    const boundary = requestBoundaryCheck(c, bindings.data, true)
    if (!boundary.success) return resultErrorResponse(c, op, boundary.errorMessage)
    const payload = await payloadParse(c, mfaWebAuthnEnrollmentVerifyRequestSchema, 1_060_000)
    if (!payload.success) return resultErrorResponse(c, op, payload.errorMessage)
    if (payload.data.method !== method) return resultErrorResponse(c, op, "request_rejected")
    const handle = flowHandleQueryGet(c)
    if (!handle.success) return resultErrorResponse(c, op, handle.errorMessage)
    const state = await stateGet(c, bindings.data, handle.data)
    if (!state.success) return resultErrorResponse(c, op, state.errorMessage)
    if (state.data.stage === "verified" || state.data.stage === "mfa" || state.data.stage === "silent") {
      return resultErrorResponse(c, op, "flow_replayed")
    }
    if (state.data.stage !== "mfa_webauthn_setup") return resultErrorResponse(c, op, "flow_stage_invalid")
    if (!csrfTokenMatches(payload.data.csrfToken, state.data.csrfToken)) {
      return resultErrorResponse(c, op, "csrf_rejected")
    }
    const limited = await abuseLimitCheck(
      bindings.data.RATE_LIMITER,
      bindings.data.FLOW_COOKIE_KEY,
      `v2-mfa-${method}-enrollment-verify`,
      [
        ["flow", state.data.flowHandle],
        ["session", state.data.sessionId],
        ["ip", c.req.header("cf-connecting-ip") ?? "unknown"],
      ],
    )
    if (!limited.success) return resultErrorResponse(c, op, limited.errorMessage)
    const request = await authRequestRevalidate(bindings.data, state.data)
    if (!request.success) return resultErrorResponse(c, op, request.errorMessage)
    if (!bindings.data.ZITADEL_LOGIN_V2_ENABLED || !bindings.data.ZITADEL_MFA_V2_ENABLED) {
      return resultErrorResponse(c, op, "mfa_enrollment_not_allowed")
    }

    const result = await mfaV2WebAuthnEnrollmentVerify({
      state: state.data,
      method,
      credential: payload.data.credential,
      ...(payload.data.displayName ? { displayName: payload.data.displayName } : {}),
      expectedRpId: new URL(bindings.data.PAGES_ORIGIN).hostname,
      expectedOrigin: bindings.data.PAGES_ORIGIN,
      now: dependencies.now(),
      client: zitadelClientCreate(bindings.data, dependencies.fetch),
    })
    if (!result.success) {
      dependencies.logger.error(`v2_mfa_${method}_enrollment_verify_failed`, {
        status: resultStatusGet(result) ?? 0,
      })
      return resultErrorResponse(c, op, result.errorMessage)
    }
    const response = v.safeParse(mfaWebAuthnEnrollmentVerifyResponseSchema, {
      transition: result.data.transition,
    })
    if (!response.success) return resultErrorResponse(c, op, "service_unavailable")
    const set = await stateSet(c, bindings.data, result.data.state)
    if (!set.success) return resultErrorResponse(c, op, "service_unavailable")
    return c.json(resultCreate(response.output), 200)
  }

  app.post("/api/v2/mfa/u2f/enroll/verify", mfaWebAuthnEnrollmentVerifyHandler)
  app.post("/api/v2/mfa/passkey/enroll/verify", mfaWebAuthnEnrollmentVerifyHandler)

  app.post("/api/v2/mfa/otp/enroll/verify", async (c) => {
    const op = "mfaTotpEnrollmentVerify"
    const bindings = bindingsGet(c)
    if (!bindings.success) return resultErrorResponse(c, op, "service_unavailable")
    const boundary = requestBoundaryCheck(c, bindings.data, true)
    if (!boundary.success) return resultErrorResponse(c, op, boundary.errorMessage)
    const payload = await payloadParse(c, mfaTotpEnrollmentVerifyRequestSchema)
    if (!payload.success) return resultErrorResponse(c, op, payload.errorMessage)
    const handle = flowHandleQueryGet(c)
    if (!handle.success) return resultErrorResponse(c, op, handle.errorMessage)
    const state = await stateGet(c, bindings.data, handle.data)
    if (!state.success) return resultErrorResponse(c, op, state.errorMessage)
    if (state.data.stage === "verified" || state.data.stage === "mfa" || state.data.stage === "silent") {
      return resultErrorResponse(c, op, "flow_replayed")
    }
    if (state.data.stage !== "mfa_totp_setup") return resultErrorResponse(c, op, "flow_stage_invalid")
    if (!csrfTokenMatches(payload.data.csrfToken, state.data.csrfToken)) {
      return resultErrorResponse(c, op, "csrf_rejected")
    }
    const limited = await abuseLimitCheck(
      bindings.data.RATE_LIMITER,
      bindings.data.FLOW_COOKIE_KEY,
      "v2-mfa-totp-enrollment-verify",
      [
        ["flow", state.data.flowHandle],
        ["session", state.data.sessionId],
        ["ip", c.req.header("cf-connecting-ip") ?? "unknown"],
      ],
    )
    if (!limited.success) return resultErrorResponse(c, op, limited.errorMessage)
    const request = await authRequestRevalidate(bindings.data, state.data)
    if (!request.success) return resultErrorResponse(c, op, request.errorMessage)
    if (!bindings.data.ZITADEL_LOGIN_V2_ENABLED || !bindings.data.ZITADEL_MFA_V2_ENABLED) {
      return resultErrorResponse(c, op, "mfa_enrollment_not_allowed")
    }

    let code = payload.data.code
    try {
      const result = await mfaV2TotpEnrollmentVerify({
        state: state.data,
        code,
        now: dependencies.now(),
        client: zitadelClientCreate(bindings.data, dependencies.fetch),
      })
      if (!result.success) {
        dependencies.logger.error("v2_mfa_totp_enrollment_verify_failed", {
          status: resultStatusGet(result) ?? 0,
        })
        return resultErrorResponse(c, op, result.errorMessage)
      }
      const response = v.safeParse(mfaTotpEnrollmentVerifyResponseSchema, {
        transition: result.data.transition,
      })
      if (!response.success) return resultErrorResponse(c, op, "service_unavailable")
      const set = await stateSet(c, bindings.data, result.data.state)
      if (!set.success) return resultErrorResponse(c, op, "service_unavailable")
      return c.json(resultCreate(response.output), 200)
    } finally {
      code = ""
      payload.data.code = ""
    }
  })

  const mfaOtpVerifyHandler = async (c: AppContext) => {
    const op = "mfaOtpVerify"
    const bindings = bindingsGet(c)
    if (!bindings.success) return resultErrorResponse(c, op, "service_unavailable")
    const boundary = requestBoundaryCheck(c, bindings.data, true)
    if (!boundary.success) return resultErrorResponse(c, op, boundary.errorMessage)
    const payload = await payloadParse(c, mfaOtpVerifyRequestSchema)
    if (!payload.success) return resultErrorResponse(c, op, payload.errorMessage)
    const handle = flowHandleQueryGet(c)
    if (!handle.success) return resultErrorResponse(c, op, handle.errorMessage)
    const state = await stateGet(c, bindings.data, handle.data)
    if (!state.success) return resultErrorResponse(c, op, state.errorMessage)
    if (state.data.stage === "verified" || state.data.stage === "silent") {
      return resultErrorResponse(c, op, "flow_replayed")
    }
    const isEmailOtp =
      c.req.path.includes("/email-otp/") ||
      payload.data.method === "email_otp" ||
      payload.data.method === "otp_email" ||
      payload.data.method === "AUTHENTICATION_METHOD_TYPE_OTP_EMAIL"
    if (state.data.stage !== "mfa" && !(isEmailOtp && state.data.stage === "mfa_email_otp_code")) {
      return resultErrorResponse(c, op, "flow_stage_invalid")
    }
    if (!csrfTokenMatches(payload.data.csrfToken, state.data.csrfToken)) {
      return resultErrorResponse(c, op, "csrf_rejected")
    }
    const path = c.req.path
    const isSmsOtp =
      path.includes("/sms-otp/") ||
      payload.data.method === "sms_otp" ||
      payload.data.method === "otp_sms" ||
      payload.data.method === "AUTHENTICATION_METHOD_TYPE_OTP_SMS"

    const rateLimitScope = isSmsOtp
      ? "v2-mfa-sms-otp-verify"
      : isEmailOtp
        ? "v2-mfa-email-otp-verify"
        : "v2-mfa-totp-verify"

    const limited = await abuseLimitCheck(bindings.data.RATE_LIMITER, bindings.data.FLOW_COOKIE_KEY, rateLimitScope, [
      ["flow", state.data.flowHandle],
      ["session", state.data.sessionId],
      ["ip", c.req.header("cf-connecting-ip") ?? "unknown"],
    ])
    if (!limited.success) return resultErrorResponse(c, op, limited.errorMessage)
    const request = await authRequestRevalidate(bindings.data, state.data)
    if (!request.success) return resultErrorResponse(c, op, request.errorMessage)
    if (!bindings.data.ZITADEL_LOGIN_V2_ENABLED || !bindings.data.ZITADEL_MFA_V2_ENABLED) {
      return transitionResponse(c, { kind: "fallback", path: `/api/v2/flow/fallback?flow=${state.data.flowHandle}` })
    }

    let code = payload.data.code
    try {
      const result =
        isSmsOtp && state.data.stage === "mfa"
          ? await mfaV2SmsOtpVerify({
              state: state.data,
              code,
              ...(payload.data.method ? { method: payload.data.method } : {}),
              now: dependencies.now(),
              client: zitadelClientCreate(bindings.data, dependencies.fetch),
            })
          : isEmailOtp
            ? await mfaV2EmailOtpVerify({
                state: state.data,
                code,
                ...(payload.data.method ? { method: payload.data.method } : {}),
                now: dependencies.now(),
                client: zitadelClientCreate(bindings.data, dependencies.fetch),
              })
            : state.data.stage === "mfa"
              ? await mfaV2TotpVerify({
                  state: state.data,
                  code,
                  ...(payload.data.method ? { method: payload.data.method } : {}),
                  now: dependencies.now(),
                  client: zitadelClientCreate(bindings.data, dependencies.fetch),
                })
              : resultErrorCreate(op, "flow_stage_invalid")
      if (!result.success) {
        dependencies.logger.error(
          isSmsOtp
            ? "v2_mfa_sms_otp_verify_failed"
            : isEmailOtp
              ? "v2_mfa_email_otp_verify_failed"
              : "v2_mfa_totp_verify_failed",
          { status: resultStatusGet(result) ?? 0 },
        )
        return resultErrorResponse(c, op, result.errorMessage)
      }
      const set = await stateSet(c, bindings.data, result.data.state)
      if (!set.success) return resultErrorResponse(c, op, "service_unavailable")
      return transitionResponse(c, result.data.transition)
    } finally {
      code = ""
      payload.data.code = ""
    }
  }

  app.post("/api/v2/mfa/otp/verify", mfaOtpVerifyHandler)
  app.post("/api/v2/mfa/totp/verify", mfaOtpVerifyHandler)
  app.post("/api/v2/mfa/email-otp/verify", mfaOtpVerifyHandler)
  app.post("/api/v2/mfa/sms-otp/verify", mfaOtpVerifyHandler)

  const mfaOtpChallengeHandler = async (c: AppContext) => {
    const op = "mfaOtpChallenge"
    const bindings = bindingsGet(c)
    if (!bindings.success) return resultErrorResponse(c, op, "service_unavailable")
    const boundary = requestBoundaryCheck(c, bindings.data, true)
    if (!boundary.success) return resultErrorResponse(c, op, boundary.errorMessage)
    const payload = await payloadParse(c, mfaOtpChallengeRequestSchema)
    if (!payload.success) return resultErrorResponse(c, op, payload.errorMessage)
    const handle = flowHandleQueryGet(c)
    if (!handle.success) return resultErrorResponse(c, op, handle.errorMessage)
    const state = await stateGet(c, bindings.data, handle.data)
    if (!state.success) return resultErrorResponse(c, op, state.errorMessage)
    if (state.data.stage === "verified" || state.data.stage === "silent") {
      return resultErrorResponse(c, op, "flow_replayed")
    }
    if (state.data.stage !== "mfa") return resultErrorResponse(c, op, "flow_stage_invalid")
    if (!csrfTokenMatches(payload.data.csrfToken, state.data.csrfToken)) {
      return resultErrorResponse(c, op, "csrf_rejected")
    }
    const path = c.req.path
    const isSmsOtp =
      path.includes("/sms-otp/") ||
      payload.data.method === "sms_otp" ||
      payload.data.method === "otp_sms" ||
      payload.data.method === "AUTHENTICATION_METHOD_TYPE_OTP_SMS"

    const limited = await abuseLimitCheck(
      bindings.data.RATE_LIMITER,
      bindings.data.FLOW_COOKIE_KEY,
      isSmsOtp ? "v2-mfa-sms-otp-challenge" : "v2-mfa-otp-challenge",
      [
        ["flow", state.data.flowHandle],
        ["session", state.data.sessionId],
        ["ip", c.req.header("cf-connecting-ip") ?? "unknown"],
      ],
    )
    if (!limited.success) return resultErrorResponse(c, op, limited.errorMessage)
    const request = await authRequestRevalidate(bindings.data, state.data)
    if (!request.success) return resultErrorResponse(c, op, request.errorMessage)
    if (!bindings.data.ZITADEL_LOGIN_V2_ENABLED || !bindings.data.ZITADEL_MFA_V2_ENABLED) {
      return transitionResponse(c, { kind: "fallback", path: `/api/v2/flow/fallback?flow=${state.data.flowHandle}` })
    }

    const result = isSmsOtp
      ? await mfaV2SmsOtpChallenge({
          state: state.data,
          ...(payload.data.method ? { method: payload.data.method } : {}),
          now: dependencies.now(),
          client: zitadelClientCreate(bindings.data, dependencies.fetch),
        })
      : await mfaV2EmailOtpChallenge({
          state: state.data,
          ...(payload.data.method ? { method: payload.data.method } : {}),
          now: dependencies.now(),
          client: zitadelClientCreate(bindings.data, dependencies.fetch),
        })
    if (!result.success) {
      dependencies.logger.error(isSmsOtp ? "v2_mfa_sms_otp_challenge_failed" : "v2_mfa_email_otp_challenge_failed", {
        status: resultStatusGet(result) ?? 0,
      })
      return resultErrorResponse(c, op, result.errorMessage)
    }
    const set = await stateSet(c, bindings.data, result.data.state)
    if (!set.success) return resultErrorResponse(c, op, "service_unavailable")
    return transitionResponse(c, result.data.transition, 202)
  }

  const mfaOtpResendHandler = async (c: AppContext) => {
    const op = "mfaOtpResend"
    const bindings = bindingsGet(c)
    if (!bindings.success) return resultErrorResponse(c, op, "service_unavailable")
    const boundary = requestBoundaryCheck(c, bindings.data, true)
    if (!boundary.success) return resultErrorResponse(c, op, boundary.errorMessage)
    const payload = await payloadParse(c, mfaOtpChallengeRequestSchema)
    if (!payload.success) return resultErrorResponse(c, op, payload.errorMessage)
    const handle = flowHandleQueryGet(c)
    if (!handle.success) return resultErrorResponse(c, op, handle.errorMessage)
    const state = await stateGet(c, bindings.data, handle.data)
    if (!state.success) return resultErrorResponse(c, op, state.errorMessage)
    if (state.data.stage === "verified" || state.data.stage === "silent") {
      return resultErrorResponse(c, op, "flow_replayed")
    }
    const path = c.req.path
    const isSmsOtp =
      path.includes("/sms-otp/") ||
      payload.data.method === "sms_otp" ||
      payload.data.method === "otp_sms" ||
      payload.data.method === "AUTHENTICATION_METHOD_TYPE_OTP_SMS"
    const isEmailOtp = !isSmsOtp
    const emailChallengeState = state.data.stage === "mfa_email_otp_code"
    if ((isSmsOtp && state.data.stage !== "mfa") || (isEmailOtp && !emailChallengeState)) {
      return resultErrorResponse(c, op, "flow_stage_invalid")
    }
    if (state.data.stage !== "mfa" && state.data.stage !== "mfa_email_otp_code") {
      return resultErrorResponse(c, op, "flow_stage_invalid")
    }
    if (!csrfTokenMatches(payload.data.csrfToken, state.data.csrfToken)) {
      return resultErrorResponse(c, op, "csrf_rejected")
    }
    const limited = await abuseLimitCheck(
      bindings.data.RATE_LIMITER,
      bindings.data.FLOW_COOKIE_KEY,
      isSmsOtp ? "v2-mfa-sms-otp-resend" : "v2-mfa-otp-resend",
      [
        ["flow", state.data.flowHandle],
        ["session", state.data.sessionId],
        ["ip", c.req.header("cf-connecting-ip") ?? "unknown"],
      ],
    )
    if (!limited.success) return resultErrorResponse(c, op, limited.errorMessage)
    const request = await authRequestRevalidate(bindings.data, state.data)
    if (!request.success) return resultErrorResponse(c, op, request.errorMessage)
    if (!bindings.data.ZITADEL_LOGIN_V2_ENABLED || !bindings.data.ZITADEL_MFA_V2_ENABLED) {
      return transitionResponse(c, { kind: "fallback", path: `/api/v2/flow/fallback?flow=${state.data.flowHandle}` })
    }

    const result =
      isSmsOtp && state.data.stage === "mfa"
        ? await mfaV2SmsOtpResend({
            state: state.data,
            ...(payload.data.method ? { method: payload.data.method } : {}),
            now: dependencies.now(),
            client: zitadelClientCreate(bindings.data, dependencies.fetch),
          })
        : !isSmsOtp && state.data.stage === "mfa_email_otp_code"
          ? await mfaV2EmailOtpResend({
              state: state.data,
              ...(payload.data.method ? { method: payload.data.method } : {}),
              now: dependencies.now(),
              client: zitadelClientCreate(bindings.data, dependencies.fetch),
            })
          : resultErrorCreate(op, "flow_stage_invalid")
    if (!result.success) {
      dependencies.logger.error(isSmsOtp ? "v2_mfa_sms_otp_resend_failed" : "v2_mfa_email_otp_resend_failed", {
        status: resultStatusGet(result) ?? 0,
      })
      return resultErrorResponse(c, op, result.errorMessage)
    }
    const set = await stateSet(c, bindings.data, result.data.state)
    if (!set.success) return resultErrorResponse(c, op, "service_unavailable")
    return transitionResponse(c, result.data.transition, 202)
  }

  app.post("/api/v2/mfa/otp/challenge", mfaOtpChallengeHandler)
  app.post("/api/v2/mfa/email-otp/challenge", mfaOtpChallengeHandler)
  app.post("/api/v2/mfa/sms-otp/challenge", mfaOtpChallengeHandler)
  app.post("/api/v2/mfa/otp/resend", mfaOtpResendHandler)
  app.post("/api/v2/mfa/email-otp/resend", mfaOtpResendHandler)
  app.post("/api/v2/mfa/sms-otp/resend", mfaOtpResendHandler)

  const mfaU2fChallengeHandler = async (c: AppContext) => {
    const op = "mfaU2fChallenge"
    const bindings = bindingsGet(c)
    if (!bindings.success) return resultErrorResponse(c, op, "service_unavailable")
    const boundary = requestBoundaryCheck(c, bindings.data, true)
    if (!boundary.success) return resultErrorResponse(c, op, boundary.errorMessage)
    const payload = await payloadParse(c, mfaU2fChallengeRequestSchema)
    if (!payload.success) return resultErrorResponse(c, op, payload.errorMessage)
    const handle = flowHandleQueryGet(c)
    if (!handle.success) return resultErrorResponse(c, op, handle.errorMessage)
    const state = await stateGet(c, bindings.data, handle.data)
    if (!state.success) return resultErrorResponse(c, op, state.errorMessage)
    if (state.data.stage === "verified" || state.data.stage === "silent") {
      return resultErrorResponse(c, op, "flow_replayed")
    }
    if (state.data.stage !== "mfa") return resultErrorResponse(c, op, "flow_stage_invalid")
    if (!csrfTokenMatches(payload.data.csrfToken, state.data.csrfToken)) {
      return resultErrorResponse(c, op, "csrf_rejected")
    }

    const expectedRpId = new URL(bindings.data.PAGES_ORIGIN).hostname
    const rpId = payload.data.rpId ?? expectedRpId
    if (rpId !== expectedRpId) {
      return resultErrorResponse(c, op, "request_rejected")
    }

    const limited = await abuseLimitCheck(
      bindings.data.RATE_LIMITER,
      bindings.data.FLOW_COOKIE_KEY,
      "v2-mfa-u2f-challenge",
      [
        ["flow", state.data.flowHandle],
        ["session", state.data.sessionId],
        ["ip", c.req.header("cf-connecting-ip") ?? "unknown"],
      ],
    )
    if (!limited.success) return resultErrorResponse(c, op, limited.errorMessage)
    const request = await authRequestRevalidate(bindings.data, state.data)
    if (!request.success) return resultErrorResponse(c, op, request.errorMessage)
    if (!bindings.data.ZITADEL_LOGIN_V2_ENABLED || !bindings.data.ZITADEL_MFA_V2_ENABLED) {
      return transitionResponse(c, { kind: "fallback", path: `/api/v2/flow/fallback?flow=${state.data.flowHandle}` })
    }

    const result = await mfaV2U2fChallenge({
      state: state.data,
      ...(payload.data.method ? { method: payload.data.method } : {}),
      rpId,
      now: dependencies.now(),
      client: zitadelClientCreate(bindings.data, dependencies.fetch),
    })
    if (!result.success) {
      dependencies.logger.error("v2_mfa_u2f_challenge_failed", {
        status: resultStatusGet(result) ?? 0,
      })
      return resultErrorResponse(c, op, result.errorMessage)
    }
    const set = await stateSet(c, bindings.data, result.data.state)
    if (!set.success) return resultErrorResponse(c, op, "service_unavailable")
    return transitionResponse(c, result.data.transition, 202)
  }

  app.post("/api/v2/mfa/u2f/challenge", mfaU2fChallengeHandler)
  app.post("/api/v2/mfa/webauthn/challenge", mfaU2fChallengeHandler)

  const mfaU2fVerifyHandler = async (c: AppContext) => {
    const op = "mfaU2fVerify"
    const bindings = bindingsGet(c)
    if (!bindings.success) return resultErrorResponse(c, op, "service_unavailable")
    const boundary = requestBoundaryCheck(c, bindings.data, true)
    if (!boundary.success) return resultErrorResponse(c, op, boundary.errorMessage)
    const payload = await payloadParse(c, mfaU2fVerifyRequestSchema)
    if (!payload.success) return resultErrorResponse(c, op, payload.errorMessage)
    const handle = flowHandleQueryGet(c)
    if (!handle.success) return resultErrorResponse(c, op, handle.errorMessage)
    const state = await stateGet(c, bindings.data, handle.data)
    if (!state.success) return resultErrorResponse(c, op, state.errorMessage)
    if (state.data.stage === "verified" || state.data.stage === "silent") {
      return resultErrorResponse(c, op, "flow_replayed")
    }
    if (state.data.stage !== "mfa") return resultErrorResponse(c, op, "flow_stage_invalid")
    if (!csrfTokenMatches(payload.data.csrfToken, state.data.csrfToken)) {
      return resultErrorResponse(c, op, "csrf_rejected")
    }

    const limited = await abuseLimitCheck(
      bindings.data.RATE_LIMITER,
      bindings.data.FLOW_COOKIE_KEY,
      "v2-mfa-u2f-verify",
      [
        ["flow", state.data.flowHandle],
        ["session", state.data.sessionId],
        ["ip", c.req.header("cf-connecting-ip") ?? "unknown"],
      ],
    )
    if (!limited.success) return resultErrorResponse(c, op, limited.errorMessage)
    const request = await authRequestRevalidate(bindings.data, state.data)
    if (!request.success) return resultErrorResponse(c, op, request.errorMessage)
    if (!bindings.data.ZITADEL_LOGIN_V2_ENABLED || !bindings.data.ZITADEL_MFA_V2_ENABLED) {
      return transitionResponse(c, { kind: "fallback", path: `/api/v2/flow/fallback?flow=${state.data.flowHandle}` })
    }

    const credential = payload.data.credential ?? payload.data.assertion
    if (!credential) return resultErrorResponse(c, op, "invalid_payload")

    const result = await mfaV2U2fVerify({
      state: state.data,
      credential,
      ...(payload.data.method ? { method: payload.data.method } : {}),
      expectedOrigin: bindings.data.PAGES_ORIGIN,
      now: dependencies.now(),
      client: zitadelClientCreate(bindings.data, dependencies.fetch),
    })
    if (!result.success) {
      dependencies.logger.error("v2_mfa_u2f_verify_failed", { status: resultStatusGet(result) ?? 0 })
      return resultErrorResponse(c, op, result.errorMessage)
    }
    const set = await stateSet(c, bindings.data, result.data.state)
    if (!set.success) return resultErrorResponse(c, op, "service_unavailable")
    return transitionResponse(c, result.data.transition)
  }

  app.post("/api/v2/mfa/u2f/verify", mfaU2fVerifyHandler)
  app.post("/api/v2/mfa/webauthn/verify", mfaU2fVerifyHandler)

  app.post("/api/v2/session/continue", async (c) => {
    const op = "sessionContinue"
    const bindings = bindingsGet(c)
    if (!bindings.success) return resultErrorResponse(c, op, "service_unavailable")
    const boundary = requestBoundaryCheck(c, bindings.data, true)
    if (!boundary.success) return resultErrorResponse(c, op, boundary.errorMessage)
    const payload = await payloadParse(c, sessionContinuePayloadSchema)
    if (!payload.success) return resultErrorResponse(c, op, payload.errorMessage)
    const handle = flowHandleQueryGet(c)
    if (!handle.success) return resultErrorResponse(c, op, handle.errorMessage)
    const state = await stateGet(c, bindings.data, handle.data)
    if (!state.success) return resultErrorResponse(c, op, state.errorMessage)
    if (
      state.data.stage === "verified" ||
      state.data.stage === "mfa" ||
      state.data.stage === "password_change_required"
    ) {
      return resultErrorResponse(c, op, "flow_replayed")
    }
    if (state.data.stage !== "ready") return resultErrorResponse(c, op, "flow_stage_invalid")
    if (!csrfTokenMatches(payload.data.csrfToken, state.data.csrfToken)) {
      return resultErrorResponse(c, op, "csrf_rejected")
    }
    const limited = await abuseLimitCheck(
      bindings.data.RATE_LIMITER,
      bindings.data.FLOW_COOKIE_KEY,
      "v2-session-continue",
      [
        ["flow", state.data.flowHandle],
        ["account", payload.data.accountId],
        ["ip", c.req.header("cf-connecting-ip") ?? "unknown"],
      ],
    )
    if (!limited.success) return resultErrorResponse(c, op, limited.errorMessage)
    const request = await authRequestRevalidate(bindings.data, state.data)
    if (!request.success) return resultErrorResponse(c, op, request.errorMessage)
    if (
      !state.data.owned ||
      !bindings.data.ZITADEL_LOGIN_V2_ENABLED ||
      !bindings.data.ZITADEL_RECENT_ACCOUNT_V2_ENABLED
    ) {
      return transitionResponse(c, { kind: "fallback", path: `/api/v2/flow/fallback?flow=${state.data.flowHandle}` })
    }

    const cookieKeys = [
      bindings.data.RECENT_ACCOUNT_COOKIE_KEY,
      bindings.data.RECENT_ACCOUNT_COOKIE_PREVIOUS_KEY,
    ].filter((key): key is string => typeof key === "string" && key.length > 0)

    const now = dependencies.now()
    const result = await recentAccountSelectionExecute({
      state: state.data,
      accountId: payload.data.accountId,
      cookieValue: recentAccountCookieValueGet(c),
      cookieKeys,
      now,
      randomBytes: dependencies.randomBytes,
      client: zitadelClientCreate(bindings.data, dependencies.fetch),
    })

    if (!result.success) {
      const rawData = result.rawData as { updatedCookieValue?: string; clearCookie?: boolean } | undefined
      if (rawData?.updatedCookieValue) {
        c.header(
          "Set-Cookie",
          cookieHeaderCreate(recentAccountCookieName, rawData.updatedCookieValue, recentAccountCookieLifetimeSeconds),
          { append: true },
        )
      } else if (rawData?.clearCookie) {
        c.header("Set-Cookie", cookieHeaderCreate(recentAccountCookieName, "", 0), { append: true })
      }
      return resultErrorResponse(c, op, result.errorMessage)
    }

    if (result.data.updatedCookieValue) {
      c.header(
        "Set-Cookie",
        cookieHeaderCreate(recentAccountCookieName, result.data.updatedCookieValue, recentAccountCookieLifetimeSeconds),
        { append: true },
      )
    } else if (result.data.clearCookie) {
      c.header("Set-Cookie", cookieHeaderCreate(recentAccountCookieName, "", 0), { append: true })
    }

    const set = await stateSet(c, bindings.data, result.data.state)
    if (!set.success) return resultErrorResponse(c, op, "service_unavailable")

    return transitionResponse(c, result.data.transition)
  })

  app.post("/api/v2/email-otp/start", async (c) => {
    const op = "emailOtpStart"
    const bindings = bindingsGet(c)
    if (!bindings.success) return resultErrorResponse(c, op, "service_unavailable")
    const boundary = requestBoundaryCheck(c, bindings.data, true)
    if (!boundary.success) return resultErrorResponse(c, op, boundary.errorMessage)
    const payload = await payloadParse(c, startPayloadSchema)
    if (!payload.success) return resultErrorResponse(c, op, payload.errorMessage)
    const state = await mutationStateGet(c, bindings.data, ["ready"] as const)
    if (!state.success) return resultErrorResponse(c, op, state.errorMessage)
    if (!csrfTokenMatches(payload.data.csrfToken, state.data.csrfToken)) {
      return resultErrorResponse(c, op, "csrf_rejected")
    }
    if (!state.data.owned || !bindings.data.ZITADEL_LOGIN_V2_ENABLED || !bindings.data.ZITADEL_EMAIL_OTP_V2_ENABLED) {
      return transitionResponse(c, { kind: "fallback", path: `/api/v2/flow/fallback?flow=${state.data.flowHandle}` })
    }
    const limited = await abuseLimitCheck(bindings.data.RATE_LIMITER, bindings.data.FLOW_COOKIE_KEY, "v2-otp-start", [
      ["flow", state.data.flowHandle],
      ["email", payload.data.email],
      ["ip", c.req.header("cf-connecting-ip") ?? "unknown"],
    ])
    if (!limited.success) return resultErrorResponse(c, op, limited.errorMessage)
    const request = await authRequestRevalidate(bindings.data, state.data)
    if (!request.success) return resultErrorResponse(c, op, request.errorMessage)

    const result = await emailOtpV2Start({
      state: state.data,
      email: payload.data.email,
      mfaV2Enabled: bindings.data.ZITADEL_MFA_V2_ENABLED,
      now: dependencies.now(),
      client: zitadelClientCreate(bindings.data, dependencies.fetch),
    })
    if (!result.success) {
      dependencies.logger.error("v2_email_otp_start_failed", { status: resultStatusGet(result) ?? 0 })
      return resultErrorResponse(c, op, result.errorMessage)
    }
    if (result.data.state !== state.data) {
      const set = await stateSet(c, bindings.data, result.data.state)
      if (!set.success) return resultErrorResponse(c, op, "service_unavailable")
    }
    return transitionResponse(c, result.data.transition, result.data.transition.kind === "render" ? 202 : 200)
  })

  app.post("/api/v2/email-otp/resend", async (c) => {
    const op = "emailOtpResend"
    const bindings = bindingsGet(c)
    if (!bindings.success) return resultErrorResponse(c, op, "service_unavailable")
    const boundary = requestBoundaryCheck(c, bindings.data, true)
    if (!boundary.success) return resultErrorResponse(c, op, boundary.errorMessage)
    const payload = await payloadParse(c, csrfPayloadSchema)
    if (!payload.success) return resultErrorResponse(c, op, payload.errorMessage)
    const state = await mutationStateGet(c, bindings.data, ["otp", "otp_decoy"] as const)
    if (!state.success) return resultErrorResponse(c, op, state.errorMessage)
    if (!csrfTokenMatches(payload.data.csrfToken, state.data.csrfToken)) {
      return resultErrorResponse(c, op, "csrf_rejected")
    }
    const limited = await abuseLimitCheck(bindings.data.RATE_LIMITER, bindings.data.FLOW_COOKIE_KEY, "v2-otp-resend", [
      ["flow", state.data.flowHandle],
      ["subject", state.data.stage === "otp" ? state.data.sessionId : state.data.flowHandle],
      ["ip", c.req.header("cf-connecting-ip") ?? "unknown"],
    ])
    if (!limited.success) return resultErrorResponse(c, op, limited.errorMessage)
    const request = await authRequestRevalidate(bindings.data, state.data)
    if (!request.success) return resultErrorResponse(c, op, request.errorMessage)
    if (state.data.stage === "otp_decoy") {
      const nextState: Extract<FlowV2Cookie, { stage: "otp_decoy" }> = {
        ...state.data,
        transitionCounter: state.data.transitionCounter + 1,
      }
      const set = await stateSet(c, bindings.data, nextState)
      if (!set.success) return resultErrorResponse(c, op, "service_unavailable")
      return transitionResponse(c, stateTransitionGet(nextState, bindings.data), 202)
    }
    const result = await emailOtpV2Resend({
      state: state.data,
      client: zitadelClientCreate(bindings.data, dependencies.fetch),
    })
    if (!result.success) return resultErrorResponse(c, op, result.errorMessage)
    const set = await stateSet(c, bindings.data, result.data.state)
    if (!set.success) return resultErrorResponse(c, op, "service_unavailable")
    return transitionResponse(c, result.data.transition, 202)
  })

  app.post("/api/v2/email-otp/verify", async (c) => {
    const op = "emailOtpVerify"
    const bindings = bindingsGet(c)
    if (!bindings.success) return resultErrorResponse(c, op, "service_unavailable")
    const boundary = requestBoundaryCheck(c, bindings.data, true)
    if (!boundary.success) return resultErrorResponse(c, op, boundary.errorMessage)
    const payload = await payloadParse(c, verifyPayloadSchema)
    if (!payload.success) return resultErrorResponse(c, op, payload.errorMessage)
    const state = await mutationStateGet(c, bindings.data, ["otp", "otp_decoy"] as const)
    if (!state.success) return resultErrorResponse(c, op, state.errorMessage)
    if (!csrfTokenMatches(payload.data.csrfToken, state.data.csrfToken)) {
      return resultErrorResponse(c, op, "csrf_rejected")
    }
    const limited = await abuseLimitCheck(bindings.data.RATE_LIMITER, bindings.data.FLOW_COOKIE_KEY, "v2-otp-verify", [
      ["flow", state.data.flowHandle],
      ["subject", state.data.stage === "otp" ? state.data.sessionId : state.data.flowHandle],
      ["ip", c.req.header("cf-connecting-ip") ?? "unknown"],
    ])
    if (!limited.success) return resultErrorResponse(c, op, limited.errorMessage)
    const request = await authRequestRevalidate(bindings.data, state.data)
    if (!request.success) return resultErrorResponse(c, op, request.errorMessage)
    if (state.data.stage === "otp_decoy") return resultErrorResponse(c, op, "code_invalid")
    const result = await emailOtpV2Verify({
      state: state.data,
      code: payload.data.code,
      now: dependencies.now(),
      client: zitadelClientCreate(bindings.data, dependencies.fetch),
    })
    if (!result.success) return resultErrorResponse(c, op, result.errorMessage)
    const set = await stateSet(c, bindings.data, result.data.state)
    if (!set.success) return resultErrorResponse(c, op, "service_unavailable")
    return transitionResponse(c, result.data.transition)
  })

  app.post("/api/v2/password/verify", async (c) => {
    const op = "passwordVerify"
    const bindings = bindingsGet(c)
    if (!bindings.success) return resultErrorResponse(c, op, "service_unavailable")
    const boundary = requestBoundaryCheck(c, bindings.data, true)
    if (!boundary.success) return resultErrorResponse(c, op, boundary.errorMessage)
    const payload = await payloadParse(c, passwordVerifyRequestSchema)
    if (!payload.success) return resultErrorResponse(c, op, payload.errorMessage)
    const handle = flowHandleQueryGet(c)
    if (!handle.success) return resultErrorResponse(c, op, handle.errorMessage)
    const state = await stateGet(c, bindings.data, handle.data)
    if (!state.success) return resultErrorResponse(c, op, state.errorMessage)
    if (
      state.data.stage === "verified" ||
      state.data.stage === "mfa" ||
      state.data.stage === "password_change_required"
    ) {
      return resultErrorResponse(c, op, "flow_replayed")
    }
    if (state.data.stage !== "ready") return resultErrorResponse(c, op, "flow_stage_invalid")
    if (!csrfTokenMatches(payload.data.csrfToken, state.data.csrfToken)) {
      return resultErrorResponse(c, op, "csrf_rejected")
    }
    const limited = await abuseLimitCheck(
      bindings.data.RATE_LIMITER,
      bindings.data.FLOW_COOKIE_KEY,
      "v2-password-verify",
      [
        ["flow", state.data.flowHandle],
        ["identifier", payload.data.identifier],
        ["ip", c.req.header("cf-connecting-ip") ?? "unknown"],
      ],
    )
    if (!limited.success) return resultErrorResponse(c, op, limited.errorMessage)
    const request = await authRequestRevalidate(bindings.data, state.data)
    if (!request.success) return resultErrorResponse(c, op, request.errorMessage)
    if (!state.data.owned || !bindings.data.ZITADEL_LOGIN_V2_ENABLED || !bindings.data.ZITADEL_PASSWORD_V2_ENABLED) {
      return transitionResponse(c, { kind: "fallback", path: `/api/v2/flow/fallback?flow=${state.data.flowHandle}` })
    }

    let password = payload.data.password
    try {
      const result = await passwordV2Verify({
        state: state.data,
        identifier: payload.data.identifier,
        password,
        mfaV2Enabled: bindings.data.ZITADEL_MFA_V2_ENABLED,
        now: dependencies.now(),
        client: zitadelClientCreate(bindings.data, dependencies.fetch),
      })
      if (!result.success) {
        dependencies.logger.error("v2_password_verify_failed", { status: resultStatusGet(result) ?? 0 })
        return resultErrorResponse(c, op, result.errorMessage)
      }
      const set = await stateSet(c, bindings.data, result.data.state)
      if (!set.success) return resultErrorResponse(c, op, "service_unavailable")
      return transitionResponse(c, result.data.transition)
    } finally {
      password = ""
      payload.data.password = ""
    }
  })

  app.post("/api/v2/password/change-required", async (c) => {
    const op = "passwordChangeRequired"
    const bindings = bindingsGet(c)
    if (!bindings.success) return resultErrorResponse(c, op, "service_unavailable")
    const boundary = requestBoundaryCheck(c, bindings.data, true)
    if (!boundary.success) return resultErrorResponse(c, op, boundary.errorMessage)
    if (c.req.header("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
      return resultErrorResponse(c, op, "unsupported_media_type")
    }
    const payload = await payloadParse(c, passwordChangeRequiredRequestSchema)
    if (!payload.success) return resultErrorResponse(c, op, payload.errorMessage)
    const handle = flowHandleQueryGet(c)
    if (!handle.success) return resultErrorResponse(c, op, handle.errorMessage)
    const stored = await stateGet(c, bindings.data, handle.data)
    if (!stored.success) return resultErrorResponse(c, op, stored.errorMessage)
    if (
      stored.data.stage === "password_changed" ||
      stored.data.stage === "verified" ||
      stored.data.stage === "silent" ||
      stored.data.stage === "mfa"
    ) {
      return resultErrorResponse(c, op, "flow_replayed")
    }
    if (stored.data.stage !== "password_change_required") {
      return resultErrorResponse(c, op, "flow_stage_invalid")
    }
    if (!csrfTokenMatches(payload.data.csrfToken, stored.data.csrfToken)) {
      return resultErrorResponse(c, op, "csrf_rejected")
    }
    const limited = await abuseLimitCheck(
      bindings.data.RATE_LIMITER,
      bindings.data.FLOW_COOKIE_KEY,
      "v2-password-change-required",
      [
        ["flow", stored.data.flowHandle],
        ["session", stored.data.sessionId],
        ["ip", c.req.header("cf-connecting-ip") ?? "unknown"],
      ],
    )
    if (!limited.success) return resultErrorResponse(c, op, limited.errorMessage)
    const request = await authRequestRevalidate(bindings.data, stored.data)
    if (!request.success) return resultErrorResponse(c, op, request.errorMessage)
    if (!bindings.data.ZITADEL_LOGIN_V2_ENABLED || !bindings.data.ZITADEL_PASSWORD_V2_ENABLED) {
      return resultErrorResponse(c, op, "password_unavailable")
    }

    const csrfToken = base64UrlEncode(dependencies.randomBytes(32))
    let currentPassword = payload.data.currentPassword
    let newPassword = payload.data.newPassword
    try {
      const result = await passwordChangeRequiredExecute({
        state: stored.data,
        currentPassword,
        newPassword,
        csrfToken,
        mfaV2Enabled: bindings.data.ZITADEL_MFA_V2_ENABLED,
        now: dependencies.now(),
        consume: (state) => stateSet(c, bindings.data, state),
        client: zitadelClientCreate(bindings.data, dependencies.fetch),
      })
      if (!result.success) {
        if (result.errorMessage === "password_policy_invalid" || result.errorMessage === "credentials_invalid") {
          const retryState = {
            ...stored.data,
            csrfToken,
            transitionCounter: stored.data.transitionCounter + 1,
          }
          const set = await stateSet(c, bindings.data, retryState)
          if (!set.success) return resultErrorResponse(c, op, "service_unavailable")
          const response = v.safeParse(passwordChangeRequiredResponseSchema, {
            success: false,
            op,
            errorMessage: result.errorMessage,
            csrfToken,
            expiresAt: retryState.expiresAt,
          })
          if (!response.success) return resultErrorResponse(c, op, "service_unavailable")
          return c.json(response.output, result.errorMessage === "credentials_invalid" ? 401 : 400)
        }
        dependencies.logger.error("v2_password_change_required_failed", {
          status: resultStatusGet(result) ?? 0,
        })
        return resultErrorResponse(c, op, result.errorMessage)
      }

      const set = await stateSet(c, bindings.data, result.data.state)
      if (!set.success) {
        return transitionResponse(c, {
          kind: "fallback",
          path: `/api/v2/flow/fallback?flow=${stored.data.flowHandle}`,
        })
      }
      const response = v.safeParse(passwordChangeRequiredResponseSchema, resultCreate(result.data.transition))
      if (!response.success) return resultErrorResponse(c, op, "service_unavailable")
      return c.json(response.output, 200)
    } finally {
      currentPassword = ""
      newPassword = ""
      payload.data.currentPassword = ""
      payload.data.newPassword = ""
    }
  })

  const passkeyChallengeHandler = async (c: AppContext) => {
    const op = "passkeyChallengeCreate"
    const bindings = bindingsGet(c)
    if (!bindings.success) return resultErrorResponse(c, op, "service_unavailable")
    const boundary = requestBoundaryCheck(c, bindings.data, true)
    if (!boundary.success) return resultErrorResponse(c, op, boundary.errorMessage)
    const payload = await payloadParse(c, passkeyChallengeRequestSchema)
    if (!payload.success) return resultErrorResponse(c, op, payload.errorMessage)
    const state = await mutationStateGet(c, bindings.data, ["ready", "passkey"] as const)
    if (!state.success) return resultErrorResponse(c, op, state.errorMessage)
    if (!csrfTokenMatches(payload.data.csrfToken, state.data.csrfToken)) {
      return resultErrorResponse(c, op, "csrf_rejected")
    }

    const expectedRpId = new URL(bindings.data.PAGES_ORIGIN).hostname
    const rpId = payload.data.rpId ?? expectedRpId
    if (rpId !== expectedRpId) {
      return resultErrorResponse(c, op, "request_rejected")
    }

    const limited = await abuseLimitCheck(
      bindings.data.RATE_LIMITER,
      bindings.data.FLOW_COOKIE_KEY,
      "v2-passkey-challenge",
      [
        ["flow", state.data.flowHandle],
        ["identifier", payload.data.identifier ?? "none"],
        ["ip", c.req.header("cf-connecting-ip") ?? "unknown"],
      ],
    )
    if (!limited.success) return resultErrorResponse(c, op, limited.errorMessage)
    const request = await authRequestRevalidate(bindings.data, state.data)
    if (!request.success) return resultErrorResponse(c, op, request.errorMessage)
    const owned = state.data.stage === "ready" ? state.data.owned : true
    if (
      state.data.stage === "ready" &&
      (!owned || !bindings.data.ZITADEL_LOGIN_V2_ENABLED || !bindings.data.ZITADEL_PASSKEY_V2_ENABLED)
    ) {
      return transitionResponse(c, { kind: "fallback", path: `/api/v2/flow/fallback?flow=${state.data.flowHandle}` })
    }

    const result = await passkeyV2ChallengeCreate({
      state: state.data,
      identifier: payload.data.identifier,
      rpId,
      mfaV2Enabled: bindings.data.ZITADEL_MFA_V2_ENABLED,
      now: dependencies.now(),
      client: zitadelClientCreate(bindings.data, dependencies.fetch),
    })
    if (!result.success) {
      dependencies.logger.error("v2_passkey_challenge_failed", { status: resultStatusGet(result) ?? 0 })
      return resultErrorResponse(c, op, result.errorMessage)
    }
    const set = await stateSet(c, bindings.data, result.data.state)
    if (!set.success) return resultErrorResponse(c, op, "service_unavailable")
    return transitionResponse(c, result.data.transition, 202)
  }

  app.post("/api/v2/passkey/challenge", passkeyChallengeHandler)
  app.post("/api/v2/webauthn/assertion/options", passkeyChallengeHandler)

  const passkeyVerifyHandler = async (c: AppContext) => {
    const op = "passkeyVerify"
    const bindings = bindingsGet(c)
    if (!bindings.success) return resultErrorResponse(c, op, "service_unavailable")
    const boundary = requestBoundaryCheck(c, bindings.data, true)
    if (!boundary.success) return resultErrorResponse(c, op, boundary.errorMessage)
    const payload = await payloadParse(c, passkeyVerifyRequestSchema)
    if (!payload.success) return resultErrorResponse(c, op, payload.errorMessage)
    const handle = flowHandleQueryGet(c)
    if (!handle.success) return resultErrorResponse(c, op, handle.errorMessage)
    const state = await stateGet(c, bindings.data, handle.data)
    if (!state.success) return resultErrorResponse(c, op, state.errorMessage)
    if (state.data.stage === "verified" || state.data.stage === "mfa") {
      return resultErrorResponse(c, op, "flow_replayed")
    }
    if (state.data.stage !== "passkey") return resultErrorResponse(c, op, "flow_stage_invalid")
    if (!csrfTokenMatches(payload.data.csrfToken, state.data.csrfToken)) {
      return resultErrorResponse(c, op, "csrf_rejected")
    }

    const limited = await abuseLimitCheck(
      bindings.data.RATE_LIMITER,
      bindings.data.FLOW_COOKIE_KEY,
      "v2-passkey-verify",
      [
        ["flow", state.data.flowHandle],
        ["subject", state.data.sessionId],
        ["ip", c.req.header("cf-connecting-ip") ?? "unknown"],
      ],
    )
    if (!limited.success) return resultErrorResponse(c, op, limited.errorMessage)
    const request = await authRequestRevalidate(bindings.data, state.data)
    if (!request.success) return resultErrorResponse(c, op, request.errorMessage)
    if (!bindings.data.ZITADEL_LOGIN_V2_ENABLED || !bindings.data.ZITADEL_PASSKEY_V2_ENABLED) {
      return transitionResponse(c, { kind: "fallback", path: `/api/v2/flow/fallback?flow=${state.data.flowHandle}` })
    }

    const credential = payload.data.credential ?? payload.data.assertion
    if (!credential) return resultErrorResponse(c, op, "invalid_payload")

    const result = await passkeyV2Verify({
      state: state.data,
      credential,
      expectedOrigin: bindings.data.PAGES_ORIGIN,
      client: zitadelClientCreate(bindings.data, dependencies.fetch),
    })
    if (!result.success) {
      dependencies.logger.error("v2_passkey_verify_failed", { status: resultStatusGet(result) ?? 0 })
      return resultErrorResponse(c, op, result.errorMessage)
    }
    const set = await stateSet(c, bindings.data, result.data.state)
    if (!set.success) return resultErrorResponse(c, op, "service_unavailable")
    return transitionResponse(c, result.data.transition)
  }

  app.post("/api/v2/passkey/verify", passkeyVerifyHandler)
  app.post("/api/v2/webauthn/assertion/verify", passkeyVerifyHandler)

  app.post("/api/v2/identity-provider/start", async (c) => {
    const op = "identityProviderStart"
    const bindings = bindingsGet(c)
    if (!bindings.success) return resultErrorResponse(c, op, "service_unavailable")
    const boundary = requestBoundaryCheck(c, bindings.data, true)
    if (!boundary.success) return resultErrorResponse(c, op, boundary.errorMessage)
    const payload = await payloadParse(c, identityProviderStartPayloadSchema)
    if (!payload.success) return resultErrorResponse(c, op, payload.errorMessage)
    const handle = flowHandleQueryGet(c)
    if (!handle.success) return resultErrorResponse(c, op, handle.errorMessage)
    const state = await stateGet(c, bindings.data, handle.data)
    if (!state.success) return resultErrorResponse(c, op, state.errorMessage)
    if (state.data.stage === "verified" || state.data.stage === "mfa" || state.data.stage === "idp_intent") {
      return resultErrorResponse(c, op, "flow_replayed")
    }
    if (state.data.stage !== "ready") return resultErrorResponse(c, op, "flow_stage_invalid")
    if (!csrfTokenMatches(payload.data.csrfToken, state.data.csrfToken)) {
      return resultErrorResponse(c, op, "csrf_rejected")
    }
    const limited = await abuseLimitCheck(bindings.data.RATE_LIMITER, bindings.data.FLOW_COOKIE_KEY, "v2-idp-start", [
      ["flow", state.data.flowHandle],
      ["idp", payload.data.idpId],
      ["ip", c.req.header("cf-connecting-ip") ?? "unknown"],
    ])
    if (!limited.success) return resultErrorResponse(c, op, limited.errorMessage)
    const request = await authRequestRevalidate(bindings.data, state.data)
    if (!request.success) return resultErrorResponse(c, op, request.errorMessage)
    if (
      !state.data.owned ||
      !bindings.data.ZITADEL_LOGIN_V2_ENABLED ||
      !bindings.data.ZITADEL_IDP_V2_ENABLED ||
      !bindings.data.ZITADEL_MFA_V2_ENABLED
    ) {
      return transitionResponse(c, { kind: "fallback", path: `/api/v2/flow/fallback?flow=${state.data.flowHandle}` })
    }

    const result = await identityProviderV2IntentStart({
      state: state.data,
      idpId: payload.data.idpId,
      pagesOrigin: bindings.data.PAGES_ORIGIN,
      mfaV2Enabled: bindings.data.ZITADEL_MFA_V2_ENABLED,
      client: zitadelClientCreate(bindings.data, dependencies.fetch),
    })
    if (!result.success) {
      dependencies.logger.error("v2_idp_start_failed", { status: resultStatusGet(result) ?? 0 })
      return resultErrorResponse(c, op, result.errorMessage)
    }
    if ("transition" in result.data) {
      return transitionResponse(c, result.data.transition)
    }
    const set = await stateSet(c, bindings.data, result.data.state)
    if (!set.success) return resultErrorResponse(c, op, "service_unavailable")
    return c.json(resultCreate({ redirectUrl: result.data.redirectUrl }), 200)
  })

  app.get("/api/v2/identity-provider/redirect", async (c) => {
    const op = "identityProviderRedirect"
    const bindings = bindingsGet(c)
    if (!bindings.success) return resultErrorResponse(c, op, "service_unavailable")
    const boundary = requestBoundaryCheck(c, bindings.data, false)
    if (!boundary.success) return resultErrorResponse(c, op, boundary.errorMessage)
    const handle = flowHandleQueryGet(c)
    if (!handle.success) return resultErrorResponse(c, op, handle.errorMessage)
    const state = await stateGet(c, bindings.data, handle.data)
    if (!state.success) return resultErrorResponse(c, op, state.errorMessage)
    if (state.data.stage !== "idp_intent" || !("redirectUrl" in state.data) || !state.data.redirectUrl) {
      return resultErrorResponse(c, op, "flow_stage_invalid")
    }
    const response = c.redirect(state.data.redirectUrl, 302)
    response.headers.set("Cache-Control", "no-store")
    response.headers.set("Referrer-Policy", "no-referrer")
    return response
  })

  const callbackHandler = async (c: AppContext) => {
    const op = "identityProviderCallback"
    const bindings = bindingsGet(c)
    if (!bindings.success) return resultErrorResponse(c, op, "service_unavailable")
    if (new URL(c.req.url).origin !== bindings.data.PAGES_ORIGIN) {
      return resultErrorResponse(c, op, "request_rejected")
    }

    const handle = callbackFlowHandleGet(c)
    if (!handle.success) return resultErrorResponse(c, op, handle.errorMessage)

    const state = await stateGet(c, bindings.data, handle.data)
    if (!state.success) return resultErrorResponse(c, op, state.errorMessage)

    if (state.data.stage === "verified" || state.data.stage === "mfa" || state.data.stage === "idp_unlinked") {
      return resultErrorResponse(c, op, "flow_replayed")
    }
    if (state.data.stage !== "idp_intent") return resultErrorResponse(c, op, "flow_stage_invalid")

    const providerId = c.req.param("provider")
    if (providerId !== state.data.idpId) {
      return resultErrorResponse(c, op, "provider_mismatch")
    }

    const limited = await abuseLimitCheck(
      bindings.data.RATE_LIMITER,
      bindings.data.FLOW_COOKIE_KEY,
      "v2-idp-callback",
      [
        ["flow", state.data.flowHandle],
        ["provider", providerId],
        ["ip", c.req.header("cf-connecting-ip") ?? "unknown"],
      ],
    )
    if (!limited.success) return resultErrorResponse(c, op, limited.errorMessage)

    const request = await authRequestRevalidate(bindings.data, state.data)
    if (!request.success) return resultErrorResponse(c, op, request.errorMessage)

    let intentId = c.req.query("id") ?? c.req.query("idp_intent_id")
    let intentToken = c.req.query("token") ?? c.req.query("idp_intent_token")

    if ((!intentId || !intentToken) && c.req.method === "POST") {
      try {
        const text = await c.req.text()
        const json = JSON.parse(text)
        if (typeof json === "object" && json !== null) {
          intentId =
            intentId ??
            (typeof json.id === "string"
              ? json.id
              : typeof json.idp_intent_id === "string"
                ? json.idp_intent_id
                : undefined)
          intentToken =
            intentToken ??
            (typeof json.token === "string"
              ? json.token
              : typeof json.idp_intent_token === "string"
                ? json.idp_intent_token
                : undefined)
        }
      } catch {
        // ignore JSON parse failure
      }
    }

    const payload = v.safeParse(identityProviderCallbackPayloadSchema, { id: intentId, token: intentToken })
    if (!payload.success) return resultErrorResponse(c, op, "request_rejected")

    const result = await identityProviderV2CallbackProcess({
      state: state.data,
      providerId,
      intentId: payload.output.id,
      intentToken: payload.output.token,
      client: zitadelClientCreate(bindings.data, dependencies.fetch),
    })

    if (!result.success) {
      dependencies.logger.error("v2_idp_callback_failed", { status: resultStatusGet(result) ?? 0 })
      return resultErrorResponse(c, op, result.errorMessage)
    }

    const set = await stateSet(c, bindings.data, result.data.state)
    if (!set.success) return resultErrorResponse(c, op, "service_unavailable")

    if (c.req.header("accept")?.includes("application/json")) {
      return transitionResponse(c, result.data.transition)
    }

    const redirectUrl =
      result.data.transition.kind === "render" ? result.data.transition.route : result.data.transition.path

    const response = c.redirect(redirectUrl, 302)
    response.headers.set("Cache-Control", "no-store")
    response.headers.set("Referrer-Policy", "no-referrer")
    return response
  }

  app.get("/api/v2/identity-provider/callback/:provider", callbackHandler)
  app.post("/api/v2/identity-provider/callback/:provider", callbackHandler)

  const failureCallbackHandler = async (c: AppContext) => {
    const op = "identityProviderCallbackFailure"
    const bindings = bindingsGet(c)
    if (!bindings.success) return resultErrorResponse(c, op, "service_unavailable")
    if (new URL(c.req.url).origin !== bindings.data.PAGES_ORIGIN) {
      return resultErrorResponse(c, op, "request_rejected")
    }

    const handle = callbackFlowHandleGet(c)
    if (!handle.success) return resultErrorResponse(c, op, handle.errorMessage)

    const state = await stateGet(c, bindings.data, handle.data)
    if (!state.success) return resultErrorResponse(c, op, state.errorMessage)

    if (state.data.stage === "verified" || state.data.stage === "mfa" || state.data.stage === "idp_unlinked") {
      return resultErrorResponse(c, op, "flow_replayed")
    }
    if (state.data.stage !== "idp_intent") return resultErrorResponse(c, op, "flow_stage_invalid")

    const providerId = c.req.param("provider")
    if (providerId !== state.data.idpId) {
      return resultErrorResponse(c, op, "provider_mismatch")
    }

    const request = await authRequestRevalidate(bindings.data, state.data)
    if (!request.success) return resultErrorResponse(c, op, request.errorMessage)

    const {
      idpId: _idpId,
      idpType: _idpType,
      redirectUrl: _redirectUrl,
      delegable: _delegable,
      ...stateBase
    } = state.data
    const nextState: Extract<FlowV2Cookie, { stage: "ready" }> = {
      ...stateBase,
      stage: "ready",
      delegable: true,
      owned: true,
      transitionCounter: state.data.transitionCounter + 1,
    }
    const set = await stateSet(c, bindings.data, nextState)
    if (!set.success) return resultErrorResponse(c, op, "service_unavailable")

    const failureRoute = `/login/idp/${encodeURIComponent(providerId)}/failure?flow=${encodeURIComponent(handle.data)}`

    if (c.req.header("accept")?.includes("application/json")) {
      return transitionResponse(c, {
        kind: "render",
        route: failureRoute,
        screen: { name: "email_otp_start" },
        csrfToken: nextState.csrfToken,
      })
    }

    const response = c.redirect(failureRoute, 302)
    response.headers.set("Cache-Control", "no-store")
    response.headers.set("Referrer-Policy", "no-referrer")
    return response
  }

  app.get("/api/v2/identity-provider/callback/:provider/failure", failureCallbackHandler)
  app.post("/api/v2/identity-provider/callback/:provider/failure", failureCallbackHandler)

  app.get("/api/v2/flow/fallback", async (c) => {
    const op = "flowFallback"
    const bindings = bindingsGet(c)
    if (!bindings.success) return resultErrorResponse(c, op, "service_unavailable")
    const boundary = requestBoundaryCheck(c, bindings.data, false)
    if (!boundary.success) return resultErrorResponse(c, op, boundary.errorMessage)
    const handle = flowHandleQueryGet(c)
    if (!handle.success) return resultErrorResponse(c, op, handle.errorMessage)
    const state = await stateGet(c, bindings.data, handle.data)
    if (!state.success) return resultErrorResponse(c, op, state.errorMessage)
    const emailEnrollmentFallback =
      state.data.stage === "mfa_email_otp_code" && state.data.enrollmentActivationConsumedAt !== undefined
    const passwordChangedFallback = state.data.stage === "password_changed"
    if (
      (!emailEnrollmentFallback &&
        !passwordChangedFallback &&
        (state.data.stage !== "ready" || !state.data.delegable)) ||
      state.data.prompt.includes("PROMPT_NONE")
    ) {
      return resultErrorResponse(c, op, "fallback_forbidden")
    }
    const request = await authRequestRevalidate(bindings.data, state.data)
    if (!request.success) {
      stateClear(c, handle.data)
      return resultErrorResponse(c, op, request.errorMessage)
    }
    const fallback = new URL(bindings.data.LOGIN_V2_FALLBACK_URL)
    fallback.searchParams.set("authRequest", state.data.authRequestId)
    stateClear(c, handle.data)
    return c.redirect(fallback.toString(), 302)
  })

  app.get("/api/v2/flow/continue", async (c) => {
    const op = "flowContinue"
    const bindings = bindingsGet(c)
    if (!bindings.success) return resultErrorResponse(c, op, "service_unavailable")
    const boundary = requestBoundaryCheck(c, bindings.data, false)
    if (!boundary.success) return resultErrorResponse(c, op, boundary.errorMessage)
    const handle = flowHandleQueryGet(c)
    if (!handle.success) return resultErrorResponse(c, op, handle.errorMessage)
    const state = await stateGet(c, bindings.data, handle.data)
    if (!state.success) return resultErrorResponse(c, op, state.errorMessage)
    if (state.data.stage !== "verified" && state.data.stage !== "silent") {
      return resultErrorResponse(c, op, "flow_stage_invalid")
    }
    const request = await authRequestRevalidate(bindings.data, state.data)
    if (!request.success) {
      stateClear(c, handle.data)
      return resultErrorResponse(c, op, request.errorMessage)
    }
    const client = zitadelClientCreate(bindings.data, dependencies.fetch)
    if (state.data.stage === "silent") {
      const callback = await client.callbackErrorCreate(state.data.authRequestId, "ERROR_REASON_LOGIN_REQUIRED")
      if (!callback.success) {
        const code = [404, 409].includes(resultStatusGet(callback) ?? 0) ? "flow_replayed" : "callback_unavailable"
        if (code === "flow_replayed") stateClear(c, handle.data)
        return resultErrorResponse(c, op, code)
      }
      if (!flowCallbackUrlIsOwned(callback.data.callbackUrl, state.data.redirectUri)) {
        dependencies.logger.error("v2_callback_url_rejected")
        return resultErrorResponse(c, op, "callback_unavailable")
      }
      stateClear(c, handle.data)
      return c.redirect(callback.data.callbackUrl, 302)
    }

    const session = await client.sessionGet(state.data.sessionId, state.data.sessionToken)
    const sessionUser = session.success ? session.data.session.factors?.user : undefined
    const emailOtpIsVerified =
      !session.success || !session.data.session.factors?.otpEmail?.verifiedAt
        ? true
        : emailOtpV2SessionIsVerified(
            session.data.session,
            {
              sessionId: state.data.sessionId,
              userId: state.data.userId,
              organizationId: state.data.organizationId,
              verifiedNotBefore: state.data.issuedAt - 60,
            },
            dependencies.now(),
          )
    if (
      !session.success ||
      session.data.session.id !== state.data.sessionId ||
      sessionUser?.id !== state.data.userId ||
      sessionUser?.organizationId !== state.data.organizationId ||
      !emailOtpIsVerified
    ) {
      return resultErrorResponse(c, op, "continuation_unavailable")
    }
    const callback = await client.callbackSessionCreate(
      state.data.authRequestId,
      state.data.sessionId,
      state.data.sessionToken,
    )
    if (!callback.success) {
      const code = [404, 409].includes(resultStatusGet(callback) ?? 0) ? "flow_replayed" : "callback_unavailable"
      if (code === "flow_replayed") stateClear(c, handle.data)
      return resultErrorResponse(c, op, code)
    }
    if (!flowCallbackUrlIsOwned(callback.data.callbackUrl, state.data.redirectUri)) {
      dependencies.logger.error("v2_callback_url_rejected")
      return resultErrorResponse(c, op, "callback_unavailable")
    }
    const now = dependencies.now()
    const account = recentAccountFromContinuationCreate(state.data, session.data.session, now)
    stateClear(c, handle.data)
    if (account) {
      const persisted = await recentAccountCookieSet(c, bindings.data, account, now)
      if (!persisted.success) dependencies.logger.warn("recent_account_cookie_write_failed")
    }
    return c.redirect(callback.data.callbackUrl, 302)
  })

  return app
}
