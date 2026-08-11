import type { Context } from "hono"
import { Hono } from "hono"
import * as v from "valibot"

import { bootstrapCacheCreate } from "../branding/bootstrapCacheCreate"
import { bootstrapViewGet } from "../branding/bootstrapViewGet"
import { workerBindingsParse } from "../config/workerBindingsParse"
import type { WorkerBindings, WorkerBindingsInput, WorkerRateLimiter } from "../config/workerBindingsSchema"
import { flowCookieOpen } from "../flow/flowCookieOpen"
import type { FlowCookie } from "../flow/flowCookieSchema"
import { flowCookieSeal } from "../flow/flowCookieSeal"
import { flowV2RouterCreate } from "../flow/http/flowV2RouterCreate"
import type { Result } from "../result/Result"
import { resultCreate } from "../result/resultCreate"
import { resultErrorCreate } from "../result/resultErrorCreate"
import { zitadelClientCreate } from "../zitadel/zitadelClientCreate"

const flowCookieName = "__Host-zitadel-login-flow"
const rateLimitRetryAfterSeconds = 60
const callbackQueryParameterNames = new Set(["code", "state", "error", "error_description", "error_uri"])
const authRequestQuerySchema = v.strictObject({
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

type AppEnvironment = { Bindings: WorkerBindingsInput }
type AppContext = Context<AppEnvironment>
type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
type Logger = {
  warn: (event: string, context?: Record<string, number | string>) => void
  error: (event: string, context?: Record<string, number | string>) => void
}

type Dependencies = {
  bootstrapCache: ReturnType<typeof bootstrapCacheCreate>
  fetch: Fetch
  now: () => number
  randomBytes: (length: number) => Uint8Array
  logger: Logger
}

type VerifiedFlowCookie = FlowCookie & {
  stage: "verified"
  sessionId: string
  sessionToken: string
}

function base64UrlEncode(value: Uint8Array): string {
  let binary = ""
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
}

function cookieValueGet(header: string | undefined): string | undefined {
  if (!header) return undefined
  for (const part of header.split(";")) {
    const [name, ...value] = part.trim().split("=")
    if (name === flowCookieName) return value.join("=")
  }
  return undefined
}

function cookieHeaderCreate(value: string, maxAge: number): string {
  return `${flowCookieName}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`
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

function errorResponse(
  c: AppContext,
  status: 400 | 401 | 403 | 404 | 409 | 415 | 429 | 500 | 502 | 503,
  code: string,
  message: string,
) {
  return c.json({ error: { code, message } }, status)
}

function resultStatusGet(result: Result<unknown>): number | undefined {
  if (result.success || typeof result.rawData !== "object" || result.rawData === null) return undefined
  if (!("status" in result.rawData) || typeof result.rawData.status !== "number") return undefined
  return result.rawData.status
}

function abuseLimitResponse(c: AppContext, result: Result<unknown>) {
  if (result.success) return undefined
  if (result.errorMessage === "rate_limited") {
    c.header("Retry-After", String(rateLimitRetryAfterSeconds))
    return errorResponse(c, 429, "rate_limited", "Too many sign-in attempts. Please retry later.")
  }
  return errorResponse(c, 503, "service_unavailable", "The sign-in service is temporarily unavailable.")
}

async function abuseLimitCheck(
  rateLimiter: WorkerRateLimiter,
  cookieKey: string,
  scope: string,
  values: Array<[string, string]>,
): Promise<Result<void>> {
  const op = "abuseLimitCheck"
  for (const [name, value] of values) {
    const key = await abuseKeyCreate(`${scope}:${name}`, value, cookieKey)
    if (!key.success) return key

    let outcome: { success: boolean }
    try {
      outcome = await rateLimiter.limit({ key: key.data })
    } catch {
      return resultErrorCreate(op, "rate_limiter_unavailable")
    }
    if (!outcome.success) return resultErrorCreate(op, "rate_limited")
  }
  return resultCreate(undefined)
}

function callbackUrlIsSafe(callbackUrl: string, redirectUri: string): boolean {
  try {
    const callback = new URL(callbackUrl)
    const redirect = new URL(redirectUri)
    if (callback.protocol !== redirect.protocol) return false
    if (callback.username || callback.password || redirect.username || redirect.password) return false
    if (
      callback.hostname !== redirect.hostname ||
      callback.port !== redirect.port ||
      callback.pathname !== redirect.pathname
    ) {
      return false
    }
    for (const key of callback.searchParams.keys()) {
      if (!redirect.searchParams.has(key) && !callbackQueryParameterNames.has(key)) return false
      if (callbackQueryParameterNames.has(key) && callback.searchParams.getAll(key).length > 1) return false
    }
    for (const key of new Set(redirect.searchParams.keys())) {
      const expected = redirect.searchParams.getAll(key)
      const actual = callback.searchParams.getAll(key)
      if (expected.length !== actual.length || expected.some((value, index) => value !== actual[index])) return false
    }
    return true
  } catch {
    return false
  }
}

async function abuseKeyCreate(scope: string, value: string, keyValue: string): Promise<Result<string>> {
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
    return resultErrorCreate(op, "Unable to create abuse limit key")
  }
}

function csrfTokenMatches(actual: string, expected: string): boolean {
  if (actual.length !== expected.length) return false
  let difference = 0
  for (let index = 0; index < actual.length; index += 1) {
    difference |= actual.charCodeAt(index) ^ expected.charCodeAt(index)
  }
  return difference === 0
}

async function payloadParse<T>(c: AppContext, schema: v.GenericSchema<unknown, T>): Promise<Result<T>> {
  const op = "payloadParse"
  if (!c.req.header("content-type")?.toLowerCase().startsWith("application/json")) {
    return resultErrorCreate(op, "unsupported_media_type")
  }
  const contentLength = Number(c.req.header("content-length") ?? "0")
  if (!Number.isFinite(contentLength) || contentLength > 4096) return resultErrorCreate(op, "invalid_payload")

  let text: string
  try {
    text = await c.req.text()
  } catch {
    return resultErrorCreate(op, "invalid_payload")
  }
  if (text.length > 4096) return resultErrorCreate(op, "invalid_payload")

  let input: unknown
  try {
    input = JSON.parse(text)
  } catch {
    return resultErrorCreate(op, "invalid_payload")
  }
  const parsed = v.safeParse(schema, input)
  if (!parsed.success) return resultErrorCreate(op, "invalid_payload")
  return resultCreate(parsed.output)
}

export function workerAppCreate(overrides: Partial<Dependencies> = {}) {
  const dependencies: Dependencies = {
    bootstrapCache: bootstrapCacheCreate(),
    fetch,
    now: () => Math.floor(Date.now() / 1000),
    randomBytes: (length) => crypto.getRandomValues(new Uint8Array(length)),
    logger: {
      warn: (event, context) => console.warn(event, context ?? {}),
      error: (event, context) => console.error(event, context ?? {}),
    },
    ...overrides,
  }
  const app = new Hono<AppEnvironment>()

  function bindingsGet(c: AppContext): Result<WorkerBindings> {
    return workerBindingsParse(c.env)
  }

  function originIsAllowed(c: AppContext, bindings: WorkerBindings): boolean {
    const origin = c.req.header("origin")
    return !origin || origin === bindings.PAGES_ORIGIN
  }

  function mutationIsAllowed(c: AppContext, bindings: WorkerBindings): boolean {
    return c.req.header("origin") === bindings.PAGES_ORIGIN
  }

  async function authRequestGet(bindings: WorkerBindings, authRequestId: string) {
    const op = "authRequestGet"
    const result = await zitadelClientCreate(bindings, dependencies.fetch).authRequestGet(authRequestId)
    if (!result.success) return result
    const authRequest = result.data.authRequest
    if (authRequest.id !== authRequestId || !bindings.ZITADEL_ALLOWED_CLIENT_IDS.includes(authRequest.clientId)) {
      return resultErrorCreate(op, "Auth request is not allowed")
    }
    const organizationScope = `urn:zitadel:iam:org:id:${bindings.ZITADEL_ORGANIZATION_ID}`
    if (authRequest.scope.some((scope) => scope.startsWith("urn:zitadel:iam:org:id:") && scope !== organizationScope)) {
      return resultErrorCreate(op, "Auth request organization is not allowed")
    }
    return resultCreate(authRequest)
  }

  async function flowCookieSet(c: AppContext, bindings: WorkerBindings, state: FlowCookie) {
    const sealed = await flowCookieSeal(state, bindings.FLOW_COOKIE_KEY, dependencies.randomBytes(12))
    if (!sealed.success) return sealed
    c.header("Set-Cookie", cookieHeaderCreate(sealed.data, Math.max(0, state.expiresAt - dependencies.now())))
    return resultCreate(undefined)
  }

  async function flowCookieGet(c: AppContext, bindings: WorkerBindings) {
    const value = cookieValueGet(c.req.header("cookie"))
    if (!value) return resultErrorCreate("flowCookieGet", "Flow state is missing")
    return flowCookieOpen(value, bindings.FLOW_COOKIE_KEY, dependencies.now())
  }

  function flowCookieClear(c: AppContext) {
    c.header("Set-Cookie", cookieHeaderCreate("", 0))
  }

  async function callbackRedirect(c: AppContext, bindings: WorkerBindings, state: VerifiedFlowCookie) {
    const authRequest = await authRequestGet(bindings, state.authRequestId)
    if (!authRequest.success || authRequest.data.clientId !== state.clientId) {
      dependencies.logger.warn("callback_auth_request_rejected")
      return errorResponse(c, 403, "invalid_flow", "The sign-in request is no longer valid.")
    }
    const callback = await zitadelClientCreate(bindings, dependencies.fetch).callbackSessionCreate(
      state.authRequestId,
      state.sessionId,
      state.sessionToken,
    )
    if (!callback.success) {
      dependencies.logger.error("callback_failed", { status: resultStatusGet(callback) ?? 0 })
      return errorResponse(c, 502, "callback_unavailable", "Sign-in completed, but could not continue. Please retry.")
    }
    if (!callbackUrlIsSafe(callback.data.callbackUrl, authRequest.data.redirectUri)) {
      dependencies.logger.error("callback_url_rejected")
      return errorResponse(c, 502, "callback_unavailable", "The sign-in callback was rejected.")
    }
    flowCookieClear(c)
    return c.redirect(callback.data.callbackUrl, 302)
  }

  async function promptNoneRedirect(c: AppContext, bindings: WorkerBindings, state: FlowCookie) {
    const authRequest = await authRequestGet(bindings, state.authRequestId)
    if (
      !authRequest.success ||
      authRequest.data.clientId !== state.clientId ||
      !authRequest.data.prompt.includes("PROMPT_NONE")
    ) {
      return errorResponse(c, 403, "invalid_flow", "The sign-in request is no longer valid.")
    }
    const callback = await zitadelClientCreate(bindings, dependencies.fetch).callbackErrorCreate(
      state.authRequestId,
      "ERROR_REASON_LOGIN_REQUIRED",
    )
    if (!callback.success || !callbackUrlIsSafe(callback.data.callbackUrl, authRequest.data.redirectUri)) {
      dependencies.logger.error("prompt_none_callback_failed", { status: resultStatusGet(callback) ?? 0 })
      return errorResponse(c, 502, "callback_unavailable", "The sign-in request could not be completed.")
    }
    flowCookieClear(c)
    return c.redirect(callback.data.callbackUrl, 302)
  }

  function fallbackResponse(c: AppContext) {
    return c.json({ status: "fallback", fallbackUrl: "/api/fallback" })
  }

  function bootstrapResultResponse(c: AppContext, result: Result<unknown>, status: 200 | 400 | 403 | 502) {
    if (result.success) return c.json(result, status)
    return c.json({ success: false, op: "bootstrap", errorMessage: "Bootstrap is temporarily unavailable." }, status)
  }

  function bootstrapOrganizationScopeIsValid(authRequest: { scope: string[] }, organizationId: string): boolean {
    if (authRequest.scope.some((scope) => scope.startsWith("urn:zitadel:iam:org:domain:"))) return false
    const organizationScopes = authRequest.scope.filter((scope) => scope.startsWith("urn:zitadel:iam:org:id:"))
    return organizationScopes.every((scope) => scope === `urn:zitadel:iam:org:id:${organizationId}`)
  }

  const bootstrapQuerySchema = v.strictObject({
    authRequest: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(200), v.regex(/^[A-Za-z0-9._~-]+$/))),
    updatedAt: v.optional(v.pipe(v.string(), v.regex(/^\d+$/), v.transform(Number), v.integer(), v.minValue(0))),
  })

  app.use("*", async (c, next) => {
    const bindings = bindingsGet(c)
    if (!bindings.success) {
      dependencies.logger.error("configuration_invalid")
      return errorResponse(c, 500, "service_unavailable", "The sign-in service is not configured.")
    }
    if (!originIsAllowed(c, bindings.data)) return errorResponse(c, 403, "origin_rejected", "Request origin rejected.")

    if (c.req.method === "OPTIONS") {
      if (c.req.header("origin") !== bindings.data.PAGES_ORIGIN) {
        return errorResponse(c, 403, "origin_rejected", "Request origin rejected.")
      }
      c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
      c.header("Access-Control-Allow-Headers", "Content-Type")
      c.header("Access-Control-Max-Age", "600")
      return c.body(null, 204)
    }

    await next()
    c.header("Cache-Control", "no-store")
    c.header("Content-Security-Policy", "default-src 'none'; base-uri 'none'; frame-ancestors 'none'")
    c.header("Referrer-Policy", "no-referrer")
    c.header("X-Content-Type-Options", "nosniff")
    c.header("X-Frame-Options", "DENY")
    c.header("Vary", "Origin")
    const origin = c.req.header("origin")
    if (origin === bindings.data.PAGES_ORIGIN) {
      c.header("Access-Control-Allow-Origin", origin)
      c.header("Access-Control-Allow-Credentials", "true")
    }
    return undefined
  })

  app.route(
    "/",
    flowV2RouterCreate({
      fetch: dependencies.fetch,
      now: dependencies.now,
      randomBytes: dependencies.randomBytes,
      logger: dependencies.logger,
    }),
  )

  app.get("/api/auth-request", async (c) => {
    const bindings = bindingsGet(c)
    if (!bindings.success) return errorResponse(c, 500, "service_unavailable", "The sign-in service is unavailable.")
    const query = v.safeParse(authRequestQuerySchema, c.req.query())
    if (!query.success) return errorResponse(c, 400, "invalid_request", "Invalid sign-in request.")
    const requestLimit = await abuseLimitCheck(
      bindings.data.RATE_LIMITER,
      bindings.data.FLOW_COOKIE_KEY,
      "auth-request",
      [
        ["request", query.output.authRequest],
        ["ip", c.req.header("cf-connecting-ip") ?? "unknown"],
      ],
    )
    const requestLimitError = abuseLimitResponse(c, requestLimit)
    if (requestLimitError) return requestLimitError

    const authRequest = await authRequestGet(bindings.data, query.output.authRequest)
    if (!authRequest.success) {
      dependencies.logger.warn("auth_request_rejected", { status: resultStatusGet(authRequest) ?? 0 })
      return errorResponse(c, 403, "invalid_request", "Invalid sign-in request.")
    }

    const now = dependencies.now()
    const state: FlowCookie = {
      version: 1,
      stage: "request",
      authRequestId: authRequest.data.id,
      clientId: authRequest.data.clientId,
      csrfToken: base64UrlEncode(dependencies.randomBytes(32)),
      issuedAt: now,
      expiresAt: now + bindings.data.SESSION_LIFETIME_SECONDS,
      ...(authRequest.data.hintUserId ? { hintUserId: authRequest.data.hintUserId } : {}),
    }
    const set = await flowCookieSet(c, bindings.data, state)
    if (!set.success) return errorResponse(c, 500, "service_unavailable", "The sign-in service is unavailable.")

    if (authRequest.data.prompt.includes("PROMPT_NONE")) {
      return c.json({ status: "continue", continuationUrl: "/api/prompt-none" })
    }

    if (
      authRequest.data.prompt.includes("PROMPT_CREATE") ||
      authRequest.data.prompt.includes("PROMPT_SELECT_ACCOUNT")
    ) {
      return fallbackResponse(c)
    }
    return c.json({
      status: "ready",
      csrfToken: state.csrfToken,
      loginHint: authRequest.data.loginHint,
      uiLocales: authRequest.data.uiLocales,
    })
  })

  app.get("/api/v2/bootstrap", async (c) => {
    const bindings = bindingsGet(c)
    if (!bindings.success) return bootstrapResultResponse(c, bindings, 502)
    const query = v.safeParse(bootstrapQuerySchema, c.req.query())
    if (!query.success)
      return bootstrapResultResponse(c, resultErrorCreate("bootstrap", "Invalid bootstrap request"), 400)

    if (query.output.authRequest) {
      const authRequest = await authRequestGet(bindings.data, query.output.authRequest)
      if (
        !authRequest.success ||
        !bootstrapOrganizationScopeIsValid(authRequest.data, bindings.data.ZITADEL_ORGANIZATION_ID)
      )
        return bootstrapResultResponse(c, resultErrorCreate("bootstrap", "Invalid bootstrap request"), 403)
    }

    const cacheKey = [
      "v1",
      bindings.data.ZITADEL_ORIGIN,
      bindings.data.ZITADEL_ORGANIZATION_ID,
      Number(bindings.data.ZITADEL_LOGIN_V2_ENABLED),
      Number(bindings.data.ZITADEL_EMAIL_OTP_V2_ENABLED),
      Number(bindings.data.ZITADEL_PASSWORD_V2_ENABLED),
      Number(bindings.data.ZITADEL_PASSKEY_V2_ENABLED),
      Number(bindings.data.ZITADEL_IDP_V2_ENABLED),
      Number(bindings.data.ZITADEL_MFA_V2_ENABLED),
    ].join(":")
    const now = dependencies.now()
    const cached = dependencies.bootstrapCache.get(cacheKey, now)
    if (cached) {
      return bootstrapResultResponse(c, resultCreate(query.output.updatedAt === cached.updatedAt ? null : cached), 200)
    }

    const client = zitadelClientCreate(bindings.data, dependencies.fetch)
    const defaultOrganization = await client.defaultOrganizationGet()
    if (
      !defaultOrganization.success ||
      defaultOrganization.data.id !== bindings.data.ZITADEL_ORGANIZATION_ID ||
      (defaultOrganization.data.state !== undefined && defaultOrganization.data.state !== "ORGANIZATION_STATE_ACTIVE")
    ) {
      dependencies.logger.warn("bootstrap_organization_rejected")
      return bootstrapResultResponse(c, resultErrorCreate("bootstrap", "Bootstrap organization is unavailable"), 403)
    }

    const view = await bootstrapViewGet({
      client,
      now,
      organization: { id: defaultOrganization.data.id, name: defaultOrganization.data.name },
      origin: bindings.data.ZITADEL_ORIGIN,
      capabilities: {
        loginV2: bindings.data.ZITADEL_LOGIN_V2_ENABLED,
        emailOtpV2: bindings.data.ZITADEL_EMAIL_OTP_V2_ENABLED,
        passwordV2: bindings.data.ZITADEL_PASSWORD_V2_ENABLED,
        passkeyV2: bindings.data.ZITADEL_PASSKEY_V2_ENABLED,
        idpV2: bindings.data.ZITADEL_IDP_V2_ENABLED,
        mfaV2: bindings.data.ZITADEL_MFA_V2_ENABLED,
      },
    })
    if (!view.success) {
      dependencies.logger.error("bootstrap_settings_failed")
      return bootstrapResultResponse(c, view, 502)
    }
    dependencies.bootstrapCache.set(cacheKey, view.data, now + 3600)
    return bootstrapResultResponse(
      c,
      resultCreate(query.output.updatedAt === view.data.updatedAt ? null : view.data),
      200,
    )
  })

  app.post("/api/email-otp/start", async (c) => {
    const bindings = bindingsGet(c)
    if (!bindings.success) return errorResponse(c, 500, "service_unavailable", "The sign-in service is unavailable.")
    if (!mutationIsAllowed(c, bindings.data))
      return errorResponse(c, 403, "origin_rejected", "Request origin rejected.")
    const payload = await payloadParse(c, startPayloadSchema)
    if (!payload.success) {
      const status = payload.errorMessage === "unsupported_media_type" ? 415 : 400
      return errorResponse(c, status, "invalid_payload", "Invalid request payload.")
    }
    const state = await flowCookieGet(c, bindings.data)
    if (!state.success || state.data.stage !== "request") {
      return errorResponse(c, 409, "invalid_flow", "Start a new sign-in request.")
    }
    if (!csrfTokenMatches(payload.data.csrfToken, state.data.csrfToken)) {
      return errorResponse(c, 403, "csrf_rejected", "Request verification failed.")
    }
    const startLimit = await abuseLimitCheck(bindings.data.RATE_LIMITER, bindings.data.FLOW_COOKIE_KEY, "otp-start", [
      ["email", payload.data.email],
      ["ip", c.req.header("cf-connecting-ip") ?? "unknown"],
    ])
    const startLimitError = abuseLimitResponse(c, startLimit)
    if (startLimitError) return startLimitError
    const authRequest = await authRequestGet(bindings.data, state.data.authRequestId)
    if (!authRequest.success || authRequest.data.clientId !== state.data.clientId) {
      return errorResponse(c, 403, "invalid_flow", "The sign-in request is no longer valid.")
    }

    const client = zitadelClientCreate(bindings.data, dependencies.fetch)
    const users = await client.usersByEmailList(payload.data.email)
    if (!users.success) {
      dependencies.logger.error("user_lookup_failed", { status: resultStatusGet(users) ?? 0 })
      return errorResponse(c, 502, "service_unavailable", "Email sign-in is temporarily unavailable.")
    }
    const user = users.data.result.length === 1 ? users.data.result[0] : undefined
    const eligible =
      user?.state === "USER_STATE_ACTIVE" &&
      user.details?.resourceOwner === bindings.data.ZITADEL_ORGANIZATION_ID &&
      user.human?.email?.isVerified === true &&
      user.human.email.email.toLowerCase() === payload.data.email &&
      (!state.data.hintUserId || state.data.hintUserId === user.userId)
    if (!eligible || !user) return fallbackResponse(c)

    const methods = await client.authenticationMethodsGet(user.userId)
    if (!methods.success) {
      dependencies.logger.error("authentication_methods_failed", { status: resultStatusGet(methods) ?? 0 })
      return errorResponse(c, 502, "service_unavailable", "Email sign-in is temporarily unavailable.")
    }
    if (!methods.data.authMethodTypes.includes("AUTHENTICATION_METHOD_TYPE_OTP_EMAIL")) return fallbackResponse(c)

    const created = await client.sessionCreate(user.userId)
    if (!created.success) {
      if (resultStatusGet(created) === 400) return fallbackResponse(c)
      dependencies.logger.error("session_create_failed", { status: resultStatusGet(created) ?? 0 })
      return errorResponse(c, 502, "service_unavailable", "Email sign-in is temporarily unavailable.")
    }
    const challenged = await client.sessionChallenge(created.data.sessionId)
    if (!challenged.success) {
      if (resultStatusGet(challenged) === 400) return fallbackResponse(c)
      dependencies.logger.error("otp_challenge_failed", { status: resultStatusGet(challenged) ?? 0 })
      return errorResponse(c, 502, "service_unavailable", "The email code could not be sent.")
    }

    const nextState: FlowCookie = {
      ...state.data,
      stage: "otp",
      sessionId: created.data.sessionId,
      sessionToken: challenged.data.sessionToken,
    }
    const set = await flowCookieSet(c, bindings.data, nextState)
    if (!set.success) return errorResponse(c, 500, "service_unavailable", "The sign-in service is unavailable.")
    return c.json({ status: "code_sent" }, 202)
  })

  app.post("/api/email-otp/resend", async (c) => {
    const bindings = bindingsGet(c)
    if (!bindings.success) return errorResponse(c, 500, "service_unavailable", "The sign-in service is unavailable.")
    if (!mutationIsAllowed(c, bindings.data))
      return errorResponse(c, 403, "origin_rejected", "Request origin rejected.")
    const payload = await payloadParse(c, csrfPayloadSchema)
    if (!payload.success) return errorResponse(c, 400, "invalid_payload", "Invalid request payload.")
    const state = await flowCookieGet(c, bindings.data)
    if (!state.success || state.data.stage !== "otp") {
      return errorResponse(c, 409, "invalid_flow", "Start a new sign-in request.")
    }
    if (!csrfTokenMatches(payload.data.csrfToken, state.data.csrfToken)) {
      return errorResponse(c, 403, "csrf_rejected", "Request verification failed.")
    }
    const resendLimit = await abuseLimitCheck(bindings.data.RATE_LIMITER, bindings.data.FLOW_COOKIE_KEY, "otp-resend", [
      ["flow", state.data.authRequestId],
      ["ip", c.req.header("cf-connecting-ip") ?? "unknown"],
    ])
    const resendLimitError = abuseLimitResponse(c, resendLimit)
    if (resendLimitError) return resendLimitError
    const authRequest = await authRequestGet(bindings.data, state.data.authRequestId)
    if (!authRequest.success || authRequest.data.clientId !== state.data.clientId) {
      return errorResponse(c, 403, "invalid_flow", "The sign-in request is no longer valid.")
    }
    const challenged = await zitadelClientCreate(bindings.data, dependencies.fetch).sessionChallenge(
      state.data.sessionId,
    )
    if (!challenged.success) {
      dependencies.logger.warn("otp_resend_failed", { status: resultStatusGet(challenged) ?? 0 })
      return errorResponse(c, 502, "service_unavailable", "The email code could not be sent.")
    }
    const set = await flowCookieSet(c, bindings.data, { ...state.data, sessionToken: challenged.data.sessionToken })
    if (!set.success) return errorResponse(c, 500, "service_unavailable", "The sign-in service is unavailable.")
    return c.json({ status: "code_sent" }, 202)
  })

  app.post("/api/email-otp/verify", async (c) => {
    const bindings = bindingsGet(c)
    if (!bindings.success) return errorResponse(c, 500, "service_unavailable", "The sign-in service is unavailable.")
    if (!mutationIsAllowed(c, bindings.data))
      return errorResponse(c, 403, "origin_rejected", "Request origin rejected.")
    const payload = await payloadParse(c, verifyPayloadSchema)
    if (!payload.success) return errorResponse(c, 400, "invalid_payload", "Invalid request payload.")
    const state = await flowCookieGet(c, bindings.data)
    if (!state.success || state.data.stage !== "otp") {
      return errorResponse(c, 409, "invalid_flow", "Start a new sign-in request.")
    }
    if (!csrfTokenMatches(payload.data.csrfToken, state.data.csrfToken)) {
      return errorResponse(c, 403, "csrf_rejected", "Request verification failed.")
    }
    const verifyLimit = await abuseLimitCheck(bindings.data.RATE_LIMITER, bindings.data.FLOW_COOKIE_KEY, "otp-verify", [
      ["session", state.data.sessionId],
      ["ip", c.req.header("cf-connecting-ip") ?? "unknown"],
    ])
    const verifyLimitError = abuseLimitResponse(c, verifyLimit)
    if (verifyLimitError) return verifyLimitError
    const authRequest = await authRequestGet(bindings.data, state.data.authRequestId)
    if (!authRequest.success || authRequest.data.clientId !== state.data.clientId) {
      return errorResponse(c, 403, "invalid_flow", "The sign-in request is no longer valid.")
    }
    const verified = await zitadelClientCreate(bindings.data, dependencies.fetch).sessionVerify(
      state.data.sessionId,
      payload.data.code,
    )
    if (!verified.success) {
      const status = resultStatusGet(verified)
      if (status && status >= 400 && status < 500) {
        return errorResponse(c, 401, "invalid_code", "The code is invalid or expired.")
      }
      dependencies.logger.error("otp_verify_failed", { status: status ?? 0 })
      return errorResponse(c, 502, "service_unavailable", "The code could not be verified.")
    }
    const verifiedState: VerifiedFlowCookie = {
      ...state.data,
      stage: "verified",
      sessionToken: verified.data.sessionToken,
    }
    const set = await flowCookieSet(c, bindings.data, verifiedState)
    if (!set.success) return errorResponse(c, 500, "service_unavailable", "The sign-in service is unavailable.")
    return c.json({ status: "verified", continuationUrl: "/api/email-otp/callback" })
  })

  app.get("/api/email-otp/callback", async (c) => {
    const bindings = bindingsGet(c)
    if (!bindings.success) return errorResponse(c, 500, "service_unavailable", "The sign-in service is unavailable.")
    const state = await flowCookieGet(c, bindings.data)
    if (!state.success || state.data.stage !== "verified") {
      return errorResponse(c, 409, "invalid_flow", "Start a new sign-in request.")
    }
    return callbackRedirect(c, bindings.data, { ...state.data, stage: "verified" })
  })

  app.post("/api/email-otp/callback", async (c) => {
    const bindings = bindingsGet(c)
    if (!bindings.success) return errorResponse(c, 500, "service_unavailable", "The sign-in service is unavailable.")
    if (!mutationIsAllowed(c, bindings.data))
      return errorResponse(c, 403, "origin_rejected", "Request origin rejected.")
    const payload = await payloadParse(c, csrfPayloadSchema)
    if (!payload.success) return errorResponse(c, 400, "invalid_payload", "Invalid request payload.")
    const state = await flowCookieGet(c, bindings.data)
    if (!state.success || state.data.stage !== "verified") {
      return errorResponse(c, 409, "invalid_flow", "Start a new sign-in request.")
    }
    if (!csrfTokenMatches(payload.data.csrfToken, state.data.csrfToken)) {
      return errorResponse(c, 403, "csrf_rejected", "Request verification failed.")
    }
    return callbackRedirect(c, bindings.data, { ...state.data, stage: "verified" })
  })

  app.get("/api/fallback", async (c) => {
    const bindings = bindingsGet(c)
    if (!bindings.success) return errorResponse(c, 500, "service_unavailable", "The sign-in service is unavailable.")
    const state = await flowCookieGet(c, bindings.data)
    if (!state.success) return errorResponse(c, 409, "invalid_flow", "Start a new sign-in request.")
    const authRequest = await authRequestGet(bindings.data, state.data.authRequestId)
    if (!authRequest.success || authRequest.data.clientId !== state.data.clientId) {
      return errorResponse(c, 403, "invalid_flow", "The sign-in request is no longer valid.")
    }
    if (authRequest.data.prompt.includes("PROMPT_NONE")) {
      return errorResponse(c, 409, "interaction_not_allowed", "Interactive sign-in is not allowed for this request.")
    }
    const fallback = new URL(bindings.data.LOGIN_V2_FALLBACK_URL)
    fallback.searchParams.set("authRequest", state.data.authRequestId)
    flowCookieClear(c)
    return c.redirect(fallback.toString(), 302)
  })

  app.get("/api/prompt-none", async (c) => {
    const bindings = bindingsGet(c)
    if (!bindings.success) return errorResponse(c, 500, "service_unavailable", "The sign-in service is unavailable.")
    const state = await flowCookieGet(c, bindings.data)
    if (!state.success || state.data.stage !== "request") {
      return errorResponse(c, 409, "invalid_flow", "Start a new sign-in request.")
    }
    return promptNoneRedirect(c, bindings.data, state.data)
  })

  app.notFound((c) => errorResponse(c, 404, "not_found", "Not found."))
  app.onError((error, c) => {
    dependencies.logger.error("unhandled_worker_error", { name: error.name })
    return errorResponse(c, 500, "service_unavailable", "The sign-in service is unavailable.")
  })

  return app
}
