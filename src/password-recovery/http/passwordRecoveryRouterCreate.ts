import type { Context } from "hono"
import { Hono } from "hono"
import * as v from "valibot"

import { workerBindingsParse } from "../../config/workerBindingsParse"
import type { WorkerBindingsInput, WorkerRateLimiter } from "../../config/workerBindingsSchema"
import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import { zitadelClientCreate } from "../../zitadel/zitadelClientCreate"
import { passwordRecoveryCookieOpen } from "../domain/passwordRecoveryCookieOpen"
import { passwordRecoveryCookieSeal } from "../domain/passwordRecoveryCookieSeal"
import { passwordResetCookieOpen } from "../domain/passwordResetCookieOpen"
import { passwordResetCookieSeal } from "../domain/passwordResetCookieSeal"
import { passwordResetDeliveryExecute } from "../domain/passwordResetDeliveryExecute"
import { passwordRecoveryBootstrapRequestSchema } from "../model/passwordRecoveryBootstrapRequestSchema"
import { passwordRecoveryBootstrapResponseSchema } from "../model/passwordRecoveryBootstrapResponseSchema"
import { passwordRecoveryCookieName } from "../model/passwordRecoveryCookieName"
import type { PasswordRecoveryCookie } from "../model/passwordRecoveryCookieSchema"
import { passwordResetCookieName } from "../model/passwordResetCookieName"
import type { PasswordResetCookie } from "../model/passwordResetCookieSchema"
import { passwordResetIngressQuerySchema } from "../model/passwordResetIngressQuerySchema"
import { passwordResetIngressResponseSchema } from "../model/passwordResetIngressResponseSchema"
import { passwordResetRequestResponseSchema } from "../model/passwordResetRequestResponseSchema"
import { passwordResetRequestSchema } from "../model/passwordResetRequestSchema"
import { passwordResetSetRequestSchema } from "../model/passwordResetSetRequestSchema"
import { passwordResetSetResponseSchema } from "../model/passwordResetSetResponseSchema"
import { passwordResetSetBootstrapRequestSchema } from "../model/passwordResetSetBootstrapRequestSchema"
import { passwordResetSetBootstrapResponseSchema } from "../model/passwordResetSetBootstrapResponseSchema"

type AppEnvironment = { Bindings: WorkerBindingsInput }
type AppContext = Context<AppEnvironment>

type Dependencies = {
  delay: (milliseconds: number) => Promise<void>
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  monotonicNow: () => number
  now: () => number
  randomBytes: (length: number) => Uint8Array
  logger: {
    error: (event: string, context?: Record<string, number | string>) => void
  }
}

const lifetimeSeconds = 300
const resetLifetimeSeconds = 600
const minimumAccountOutcomeMilliseconds = 2_000

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

function cookieValueGet(header: string | undefined): string | undefined {
  if (!header) return undefined
  for (const part of header.split(";")) {
    const [name, ...value] = part.trim().split("=")
    if (name === passwordRecoveryCookieName) return value.join("=")
  }
  return undefined
}

function namedCookieValueGet(header: string | undefined, cookieName: string): string | undefined {
  if (!header) return undefined
  const values: string[] = []
  for (const part of header.split(";")) {
    const [name, ...value] = part.trim().split("=")
    if (name === cookieName) values.push(value.join("="))
  }
  return values.length === 1 ? values[0] : undefined
}

function csrfTokenMatches(actual: string, expected: string): boolean {
  if (actual.length !== expected.length) return false
  let difference = 0
  for (let index = 0; index < actual.length; index += 1) {
    difference |= actual.charCodeAt(index) ^ expected.charCodeAt(index)
  }
  return difference === 0
}

function nativeErrorIdGet(rawData: unknown): string | undefined {
  if (typeof rawData !== "object" || rawData === null || !("id" in rawData)) return undefined
  return typeof rawData.id === "string" ? rawData.id : undefined
}

async function abuseKeyCreate(scope: string, value: string, keyValue: string) {
  const op = "passwordResetAbuseKeyCreate"
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

async function abuseLimitCheck(rateLimiter: WorkerRateLimiter, cookieKey: string, values: Array<[string, string]>) {
  const op = "passwordResetAbuseLimitCheck"
  for (const [name, value] of values) {
    const key = await abuseKeyCreate(`password-reset-request:${name}`, value, cookieKey)
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

async function resetSetAbuseLimitCheck(
  rateLimiter: WorkerRateLimiter,
  cookieKey: string,
  values: Array<[string, string]>,
) {
  const op = "passwordResetSetAbuseLimitCheck"
  for (const [name, value] of values) {
    const key = await abuseKeyCreate(`password-reset-set:${name}`, value, cookieKey)
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

function errorResponse(c: AppContext, code: string, status: 400 | 403 | 404 | 415 | 503) {
  const parsed = v.safeParse(passwordRecoveryBootstrapResponseSchema, {
    success: false,
    op: "passwordRecoveryBootstrap",
    errorMessage: code,
  })
  if (!parsed.success) {
    return c.json(
      { success: false, op: "passwordRecoveryBootstrap", errorMessage: "service_unavailable" } as const,
      503,
    )
  }
  return c.json(parsed.output, status)
}

async function payloadParse(c: AppContext) {
  const op = "passwordRecoveryBootstrapPayloadParse"
  if (c.req.header("content-type") !== "application/json") {
    return resultErrorCreate(op, "unsupported_media_type")
  }
  const contentLength = Number(c.req.header("content-length") ?? "0")
  if (!Number.isFinite(contentLength) || contentLength > 128) return resultErrorCreate(op, "invalid_payload")

  try {
    const text = await c.req.text()
    if (text.length > 128) return resultErrorCreate(op, "invalid_payload")
    const parsed = v.safeParse(passwordRecoveryBootstrapRequestSchema, JSON.parse(text))
    if (!parsed.success) return resultErrorCreate(op, "invalid_payload")
    return resultCreate(parsed.output)
  } catch {
    return resultErrorCreate(op, "invalid_payload")
  }
}

async function resetPayloadParse(c: AppContext) {
  const op = "passwordResetRequestPayloadParse"
  if (c.req.header("content-type") !== "application/json") {
    return resultErrorCreate(op, "unsupported_media_type")
  }
  const contentLength = Number(c.req.header("content-length") ?? "0")
  if (!Number.isFinite(contentLength) || contentLength > 512) return resultErrorCreate(op, "invalid_payload")

  try {
    const text = await c.req.text()
    if (text.length > 512) return resultErrorCreate(op, "invalid_payload")
    const parsed = v.safeParse(passwordResetRequestSchema, JSON.parse(text))
    if (!parsed.success) return resultErrorCreate(op, "invalid_payload")
    return resultCreate(parsed.output)
  } catch {
    return resultErrorCreate(op, "invalid_payload")
  }
}

async function resetSetBootstrapPayloadParse(c: AppContext) {
  const op = "passwordResetSetBootstrapPayloadParse"
  if (c.req.header("content-type") !== "application/json") {
    return resultErrorCreate(op, "unsupported_media_type")
  }
  const contentLength = Number(c.req.header("content-length") ?? "0")
  if (!Number.isFinite(contentLength) || contentLength > 128) return resultErrorCreate(op, "invalid_payload")

  try {
    const text = await c.req.text()
    if (text.length > 128) return resultErrorCreate(op, "invalid_payload")
    const parsed = v.safeParse(passwordResetSetBootstrapRequestSchema, JSON.parse(text))
    if (!parsed.success) return resultErrorCreate(op, "invalid_payload")
    return resultCreate(parsed.output)
  } catch {
    return resultErrorCreate(op, "invalid_payload")
  }
}

async function resetSetPayloadParse(c: AppContext) {
  const op = "passwordResetSetPayloadParse"
  if (c.req.header("content-type") !== "application/json") {
    return resultErrorCreate(op, "unsupported_media_type")
  }
  const contentLength = Number(c.req.header("content-length") ?? "0")
  if (!Number.isFinite(contentLength) || contentLength > 512) return resultErrorCreate(op, "invalid_payload")

  try {
    const text = await c.req.text()
    if (text.length > 512) return resultErrorCreate(op, "invalid_payload")
    const parsed = v.safeParse(passwordResetSetRequestSchema, JSON.parse(text))
    if (!parsed.success) return resultErrorCreate(op, "invalid_payload")
    return resultCreate(parsed.output)
  } catch {
    return resultErrorCreate(op, "invalid_payload")
  }
}

function resetIngressQueryParse(url: URL) {
  const op = "passwordResetIngressQueryParse"
  const parts = url.search.startsWith("?") ? url.search.slice(1).split("&") : []
  if (parts.length !== 3) return resultErrorCreate(op, "invalid_link")

  const input: Record<string, string> = {}
  for (const part of parts) {
    const separator = part.indexOf("=")
    if (separator <= 0 || separator === part.length - 1) return resultErrorCreate(op, "invalid_link")
    const key = part.slice(0, separator)
    const value = part.slice(separator + 1)
    if (!(["userId", "orgId", "code"] as const).includes(key as "userId" | "orgId" | "code")) {
      return resultErrorCreate(op, "invalid_link")
    }
    if (key in input || !/^[A-Za-z0-9._~-]+$/.test(value)) return resultErrorCreate(op, "invalid_link")
    input[key] = value
  }

  const parsed = v.safeParse(passwordResetIngressQuerySchema, input)
  if (!parsed.success) return resultErrorCreate(op, "invalid_link")
  return resultCreate(parsed.output)
}

function resetErrorResponse(c: AppContext, code: string, status: 400 | 403 | 404 | 409 | 415 | 429 | 503) {
  const exposedCode = code === "rate_limiter_unavailable" ? "service_unavailable" : code
  const parsed = v.safeParse(passwordResetRequestResponseSchema, {
    success: false,
    op: "passwordResetRequest",
    errorMessage: exposedCode,
  })
  if (!parsed.success) {
    return c.json({ success: false, op: "passwordResetRequest", errorMessage: "service_unavailable" } as const, 503)
  }
  return c.json(parsed.output, status)
}

function resetSetBootstrapErrorResponse(c: AppContext, code: string, status: 400 | 403 | 404 | 409 | 415 | 503) {
  const exposedCode = code.startsWith("password_reset_") ? "invalid_link" : code
  const parsed = v.safeParse(passwordResetSetBootstrapResponseSchema, {
    success: false,
    op: "passwordResetSetBootstrap",
    errorMessage: exposedCode,
  })
  if (!parsed.success) {
    return c.json(
      { success: false, op: "passwordResetSetBootstrap", errorMessage: "service_unavailable" } as const,
      503,
    )
  }
  return c.json(parsed.output, status)
}

function resetSetErrorResponse(c: AppContext, code: string, status: 400 | 403 | 404 | 409 | 415 | 503) {
  const parsed = v.safeParse(passwordResetSetResponseSchema, {
    success: false,
    op: "passwordResetSet",
    errorMessage: code,
  })
  if (!parsed.success) {
    return c.json({ success: false, op: "passwordResetSet", errorMessage: "service_unavailable" } as const, 503)
  }
  return c.json(parsed.output, status)
}

function resetCookieClear(c: AppContext) {
  c.header("Set-Cookie", `${passwordResetCookieName}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`)
}

function resetIngressErrorResponse(c: AppContext, code: string, status: 400 | 404 | 503) {
  const parsed = v.safeParse(passwordResetIngressResponseSchema, {
    success: false,
    op: "passwordResetIngress",
    errorMessage: code,
  })
  if (!parsed.success) {
    return c.json({ success: false, op: "passwordResetIngress", errorMessage: "service_unavailable" } as const, 503)
  }
  return c.json(parsed.output, status)
}

export function passwordRecoveryRouterCreate(dependencies: Dependencies) {
  const app = new Hono<AppEnvironment>()

  app.get("/api/v2/password/reset/ingress", async (c) => {
    const bindings = workerBindingsParse(c.env)
    if (!bindings.success) return resetIngressErrorResponse(c, "service_unavailable", 503)
    if (!bindings.data.ZITADEL_PASSWORD_RESET_V2_ENABLED) {
      return resetIngressErrorResponse(c, "capability_disabled", 404)
    }

    const url = new URL(c.req.url)
    if (url.origin !== bindings.data.PAGES_ORIGIN) return resetIngressErrorResponse(c, "invalid_link", 400)
    const query = resetIngressQueryParse(url)
    if (!query.success || query.data.orgId !== bindings.data.ZITADEL_ORGANIZATION_ID) {
      return resetIngressErrorResponse(c, "invalid_link", 400)
    }

    const now = dependencies.now()
    const state: PasswordResetCookie = {
      version: 1,
      purpose: "password_reset",
      userId: query.data.userId,
      organizationId: query.data.orgId,
      verificationCode: query.data.code,
      issuedAt: now,
      expiresAt: now + resetLifetimeSeconds,
      transition: 0,
    }
    const sealed = await passwordResetCookieSeal(state, bindings.data.FLOW_COOKIE_KEY, dependencies.randomBytes(12))
    if (!sealed.success) return resetIngressErrorResponse(c, "service_unavailable", 503)

    c.header(
      "Set-Cookie",
      `${passwordResetCookieName}=${sealed.data}; Path=/; Max-Age=${resetLifetimeSeconds}; HttpOnly; Secure; SameSite=Lax`,
    )
    return c.redirect("/password/reset", 302)
  })

  app.post("/api/v2/password/reset/set-bootstrap", async (c) => {
    const bindings = workerBindingsParse(c.env)
    if (!bindings.success) return resetSetBootstrapErrorResponse(c, "service_unavailable", 503)
    if (!bindings.data.ZITADEL_PASSWORD_RESET_V2_ENABLED) {
      return resetSetBootstrapErrorResponse(c, "capability_disabled", 404)
    }
    if (
      new URL(c.req.url).origin !== bindings.data.PAGES_ORIGIN ||
      c.req.header("origin") !== bindings.data.PAGES_ORIGIN
    ) {
      return resetSetBootstrapErrorResponse(c, "origin_rejected", 403)
    }

    const payload = await resetSetBootstrapPayloadParse(c)
    if (!payload.success) {
      return resetSetBootstrapErrorResponse(
        c,
        payload.errorMessage,
        payload.errorMessage === "unsupported_media_type" ? 415 : 400,
      )
    }

    const cookieValue = namedCookieValueGet(c.req.header("cookie"), passwordResetCookieName)
    if (!cookieValue) return resetSetBootstrapErrorResponse(c, "invalid_link", 409)
    const cookieKeys = [bindings.data.FLOW_COOKIE_KEY]
    if (bindings.data.FLOW_COOKIE_PREVIOUS_KEY) cookieKeys.push(bindings.data.FLOW_COOKIE_PREVIOUS_KEY)
    const now = dependencies.now()
    const state = await passwordResetCookieOpen(cookieValue, cookieKeys, now, [0, 1])
    if (!state.success || state.data.organizationId !== bindings.data.ZITADEL_ORGANIZATION_ID) {
      return resetSetBootstrapErrorResponse(c, "invalid_link", 409)
    }

    const csrfToken = base64UrlEncode(dependencies.randomBytes(32))
    const nextState: PasswordResetCookie = { ...state.data, transition: 1, csrfToken }
    const sealed = await passwordResetCookieSeal(nextState, bindings.data.FLOW_COOKIE_KEY, dependencies.randomBytes(12))
    if (!sealed.success) return resetSetBootstrapErrorResponse(c, "service_unavailable", 503)
    const response = v.safeParse(passwordResetSetBootstrapResponseSchema, {
      success: true,
      data: {
        status: "ready",
        screen: "password_reset",
        csrfToken,
        expiresAt: state.data.expiresAt,
      },
    })
    if (!response.success) return resetSetBootstrapErrorResponse(c, "service_unavailable", 503)

    c.header(
      "Set-Cookie",
      `${passwordResetCookieName}=${sealed.data}; Path=/; Max-Age=${Math.max(0, state.data.expiresAt - now)}; HttpOnly; Secure; SameSite=Lax`,
    )
    return c.json(response.output, 200)
  })

  app.post("/api/v2/password/reset/set", async (c) => {
    const bindings = workerBindingsParse(c.env)
    if (!bindings.success) return resetSetErrorResponse(c, "service_unavailable", 503)
    if (!bindings.data.ZITADEL_PASSWORD_RESET_V2_ENABLED) {
      return resetSetErrorResponse(c, "capability_disabled", 404)
    }
    if (
      new URL(c.req.url).origin !== bindings.data.PAGES_ORIGIN ||
      c.req.header("origin") !== bindings.data.PAGES_ORIGIN
    ) {
      return resetSetErrorResponse(c, "origin_rejected", 403)
    }

    const payload = await resetSetPayloadParse(c)
    if (!payload.success) {
      return resetSetErrorResponse(
        c,
        payload.errorMessage,
        payload.errorMessage === "unsupported_media_type" ? 415 : 400,
      )
    }

    const cookieValue = namedCookieValueGet(c.req.header("cookie"), passwordResetCookieName)
    if (!cookieValue) {
      resetCookieClear(c)
      return resetSetErrorResponse(c, "invalid_link", 409)
    }
    const cookieKeys = [bindings.data.FLOW_COOKIE_KEY]
    if (bindings.data.FLOW_COOKIE_PREVIOUS_KEY) cookieKeys.push(bindings.data.FLOW_COOKIE_PREVIOUS_KEY)
    const now = dependencies.now()
    const state = await passwordResetCookieOpen(cookieValue, cookieKeys, now, [1])
    if (
      !state.success ||
      state.data.transition !== 1 ||
      state.data.organizationId !== bindings.data.ZITADEL_ORGANIZATION_ID
    ) {
      resetCookieClear(c)
      return resetSetErrorResponse(c, "invalid_link", 409)
    }
    if (!csrfTokenMatches(payload.data.csrfToken, state.data.csrfToken)) {
      return resetSetErrorResponse(c, "csrf_rejected", 403)
    }

    const limited = await resetSetAbuseLimitCheck(bindings.data.RATE_LIMITER, bindings.data.FLOW_COOKIE_KEY, [
      ["state", `${state.data.organizationId}\u0000${state.data.userId}\u0000${state.data.verificationCode}`],
      ["ip", c.req.header("cf-connecting-ip") ?? "unknown"],
    ])
    if (!limited.success) {
      dependencies.logger.error("password_reset_set_rate_limiter_failed")
      return resetSetErrorResponse(c, "service_unavailable", 503)
    }

    const client = zitadelClientCreate(bindings.data, dependencies.fetch)
    const account = await client.userGet(state.data.userId)
    if (!account.success) {
      if (nativeErrorIdGet(account.rawData) === "QUERY-Dfbg2") {
        resetCookieClear(c)
        return resetSetErrorResponse(c, "invalid_link", 409)
      }
      dependencies.logger.error("password_reset_set_account_failed")
      return resetSetErrorResponse(c, "service_unavailable", 503)
    }
    if (
      account.data.user.userId !== state.data.userId ||
      account.data.user.state !== "USER_STATE_ACTIVE" ||
      account.data.user.details?.resourceOwner !== state.data.organizationId ||
      !account.data.user.human
    ) {
      resetCookieClear(c)
      return resetSetErrorResponse(c, "invalid_link", 409)
    }

    const changed = await client.passwordSet(
      state.data.userId,
      payload.data.password,
      { mode: "verification_code", verificationCode: state.data.verificationCode },
      false,
    )
    if (!changed.success && changed.errorMessage === "password_policy_invalid") {
      const csrfToken = base64UrlEncode(dependencies.randomBytes(32))
      const nextState: PasswordResetCookie = { ...state.data, csrfToken }
      const sealed = await passwordResetCookieSeal(
        nextState,
        bindings.data.FLOW_COOKIE_KEY,
        dependencies.randomBytes(12),
      )
      if (!sealed.success) {
        dependencies.logger.error("password_reset_set_state_failed")
        return resetSetErrorResponse(c, "service_unavailable", 503)
      }
      const response = v.safeParse(passwordResetSetResponseSchema, {
        success: false,
        op: "passwordResetSet",
        errorMessage: "password_policy_invalid",
        csrfToken,
        expiresAt: state.data.expiresAt,
      })
      if (!response.success) return resetSetErrorResponse(c, "service_unavailable", 503)
      c.header(
        "Set-Cookie",
        `${passwordResetCookieName}=${sealed.data}; Path=/; Max-Age=${Math.max(0, state.data.expiresAt - now)}; HttpOnly; Secure; SameSite=Lax`,
      )
      return c.json(response.output, 400)
    }
    if (!changed.success && changed.errorMessage === "password_reset_link_invalid") {
      resetCookieClear(c)
      return resetSetErrorResponse(c, "invalid_link", 409)
    }
    if (!changed.success) {
      dependencies.logger.error("password_reset_set_failed")
      return resetSetErrorResponse(c, "service_unavailable", 503)
    }

    const response = v.safeParse(passwordResetSetResponseSchema, {
      success: true,
      data: { status: "complete" },
    })
    if (!response.success) return resetSetErrorResponse(c, "service_unavailable", 503)
    resetCookieClear(c)
    return c.json(response.output, 200)
  })

  app.post("/api/v2/password/reset/bootstrap", async (c) => {
    const bindings = workerBindingsParse(c.env)
    if (!bindings.success) return errorResponse(c, "service_unavailable", 503)
    if (!bindings.data.ZITADEL_PASSWORD_RESET_V2_ENABLED) return errorResponse(c, "capability_disabled", 404)
    if (
      new URL(c.req.url).origin !== bindings.data.PAGES_ORIGIN ||
      c.req.header("origin") !== bindings.data.PAGES_ORIGIN
    ) {
      return errorResponse(c, "origin_rejected", 403)
    }

    const payload = await payloadParse(c)
    if (!payload.success) {
      return errorResponse(c, payload.errorMessage, payload.errorMessage === "unsupported_media_type" ? 415 : 400)
    }

    const now = dependencies.now()
    const state: PasswordRecoveryCookie = {
      version: 1,
      purpose: "password_recovery",
      csrfToken: base64UrlEncode(dependencies.randomBytes(32)),
      issuedAt: now,
      expiresAt: now + lifetimeSeconds,
      transition: 0,
    }
    const sealed = await passwordRecoveryCookieSeal(state, bindings.data.FLOW_COOKIE_KEY, dependencies.randomBytes(12))
    if (!sealed.success) return errorResponse(c, "recovery_state_unavailable", 503)

    const response = v.safeParse(passwordRecoveryBootstrapResponseSchema, {
      success: true,
      data: { status: "ready", csrfToken: state.csrfToken, expiresAt: state.expiresAt },
    })
    if (!response.success) return errorResponse(c, "service_unavailable", 503)
    c.header(
      "Set-Cookie",
      `${passwordRecoveryCookieName}=${sealed.data}; Path=/; Max-Age=${lifetimeSeconds}; HttpOnly; Secure; SameSite=Lax`,
    )
    return c.json(response.output, 200)
  })

  app.post("/api/v2/password/reset/request", async (c) => {
    const bindings = workerBindingsParse(c.env)
    if (!bindings.success) return resetErrorResponse(c, "service_unavailable", 503)
    if (!bindings.data.ZITADEL_PASSWORD_RESET_V2_ENABLED) {
      return resetErrorResponse(c, "capability_disabled", 404)
    }
    if (
      new URL(c.req.url).origin !== bindings.data.PAGES_ORIGIN ||
      c.req.header("origin") !== bindings.data.PAGES_ORIGIN
    ) {
      return resetErrorResponse(c, "origin_rejected", 403)
    }

    const payload = await resetPayloadParse(c)
    if (!payload.success) {
      return resetErrorResponse(c, payload.errorMessage, payload.errorMessage === "unsupported_media_type" ? 415 : 400)
    }

    const cookieValue = cookieValueGet(c.req.header("cookie"))
    if (!cookieValue) return resetErrorResponse(c, "recovery_state_invalid", 409)
    const cookieKeys = [bindings.data.FLOW_COOKIE_KEY]
    if (bindings.data.FLOW_COOKIE_PREVIOUS_KEY) cookieKeys.push(bindings.data.FLOW_COOKIE_PREVIOUS_KEY)
    const now = dependencies.now()
    const state = await passwordRecoveryCookieOpen(cookieValue, cookieKeys, now, 0)
    if (!state.success) return resetErrorResponse(c, state.errorMessage, 409)
    if (!csrfTokenMatches(payload.data.csrfToken, state.data.csrfToken)) {
      return resetErrorResponse(c, "csrf_rejected", 403)
    }

    const limited = await abuseLimitCheck(bindings.data.RATE_LIMITER, bindings.data.FLOW_COOKIE_KEY, [
      ["email", payload.data.email],
      ["ip", c.req.header("cf-connecting-ip") ?? "unknown"],
    ])
    if (!limited.success) {
      if (limited.errorMessage === "rate_limited") {
        c.header("Retry-After", "60")
        return resetErrorResponse(c, "rate_limited", 429)
      }
      dependencies.logger.error("password_reset_rate_limiter_failed")
      return resetErrorResponse(c, "service_unavailable", 503)
    }

    const nextState: PasswordRecoveryCookie = { ...state.data, transition: 1 }
    const sealed = await passwordRecoveryCookieSeal(
      nextState,
      bindings.data.FLOW_COOKIE_KEY,
      dependencies.randomBytes(12),
    )
    if (!sealed.success) return resetErrorResponse(c, "service_unavailable", 503)

    const accountOutcomeStartedAt = dependencies.monotonicNow()
    const delivered = await passwordResetDeliveryExecute({
      client: zitadelClientCreate(bindings.data, dependencies.fetch),
      email: payload.data.email,
      organizationId: bindings.data.ZITADEL_ORGANIZATION_ID,
      pagesOrigin: bindings.data.PAGES_ORIGIN,
    })
    const remainingDelay = minimumAccountOutcomeMilliseconds - (dependencies.monotonicNow() - accountOutcomeStartedAt)
    if (remainingDelay > 0) await dependencies.delay(remainingDelay)
    if (!delivered.success) {
      dependencies.logger.error("password_reset_delivery_failed")
      return resetErrorResponse(c, "service_unavailable", 503)
    }

    const response = v.safeParse(passwordResetRequestResponseSchema, {
      success: true,
      data: { status: "accepted" },
    })
    if (!response.success) return resetErrorResponse(c, "service_unavailable", 503)
    c.header(
      "Set-Cookie",
      `${passwordRecoveryCookieName}=${sealed.data}; Path=/; Max-Age=${Math.max(0, state.data.expiresAt - now)}; HttpOnly; Secure; SameSite=Lax`,
    )
    return c.json(response.output, 202)
  })

  return app
}
