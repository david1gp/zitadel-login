import type { Context } from "hono"
import { Hono } from "hono"

import { workerBindingsParse } from "../config/workerBindingsParse"
import type { WorkerBindingsInput } from "../config/workerBindingsSchema"
import { emailOtpCooldownClientCreate } from "../email-otp/cooldown/emailOtpCooldownClientCreate"
import { resultCreate } from "../result/resultCreate"
import { cooldownMetadataCreate } from "./cooldownMetadataCreate"
import type { CooldownMetadata } from "./cooldownMetadataSchema"
import { cooldownRetryAfterSecondsGet } from "./cooldownRetryAfterSecondsGet"
import { otpLimitTestRequestSchema } from "./otpLimitTestRequestSchema"
import { requestPayloadParse } from "./requestPayloadParse"
import { secretMatches } from "./secretMatches"

type AppEnvironment = { Bindings: WorkerBindingsInput }
type AppContext = Context<AppEnvironment>
type Dependencies = {
  now: () => number
}

const payloadMaximumLength = 256

function errorResponse(c: AppContext, code: string) {
  const status =
    code === "not_found"
      ? 404
      : code === "origin_rejected"
        ? 403
        : code === "unauthorized"
          ? 401
          : code === "unsupported_media_type"
            ? 415
            : code === "invalid_payload"
              ? 400
              : code === "rate_limited"
                ? 429
                : 503
  return c.json({ success: false, op: "otpLimitTest", errorMessage: code }, status)
}

function cooldownMetadataHeadersSet(c: AppContext, metadata: CooldownMetadata) {
  c.header("X-Cooldown-Expires-At", String(metadata.cooldownExpiresAt))
  c.header("X-Cooldown-Remaining-Seconds", String(metadata.cooldownRemainingSeconds))
}

function cooldownLimitedResponse(c: AppContext, metadata: CooldownMetadata) {
  cooldownMetadataHeadersSet(c, metadata)
  c.header("Retry-After", String(cooldownRetryAfterSecondsGet(metadata)))
  return c.json({ success: false, op: "otpLimitTest", errorMessage: "rate_limited", data: metadata }, 429)
}

function authorizationTokenGet(header: string | undefined): string | undefined {
  if (!header || !header.startsWith("Bearer ")) return undefined
  const token = header.slice("Bearer ".length)
  return token.length > 0 ? token : undefined
}

export function otpLimitTestRouterCreate(dependencies: Dependencies) {
  const app = new Hono<AppEnvironment>()

  app.post("/api/v2/internal/otp-limit-test", async (c) => {
    const bindings = workerBindingsParse(c.env)
    if (!bindings.success) return errorResponse(c, "service_unavailable")
    if (!bindings.data.OTP_LIMIT_TEST_SECRET || !bindings.data.EMAIL_OTP_COOLDOWN) {
      return errorResponse(c, "not_found")
    }
    if (
      new URL(c.req.url).origin !== bindings.data.PAGES_ORIGIN ||
      c.req.header("origin") !== bindings.data.PAGES_ORIGIN
    ) {
      return errorResponse(c, "origin_rejected")
    }

    const token = authorizationTokenGet(c.req.header("authorization"))
    if (!token || !secretMatches(token, bindings.data.OTP_LIMIT_TEST_SECRET)) {
      return errorResponse(c, "unauthorized")
    }

    const payload = await requestPayloadParse(c.req, otpLimitTestRequestSchema, {
      contentType: "exact",
      maximumLength: payloadMaximumLength,
      operation: "otpLimitTest",
    })
    if (!payload.success) return errorResponse(c, payload.errorMessage)

    const now = dependencies.now()
    const reserved = await emailOtpCooldownClientCreate({
      namespace: bindings.data.EMAIL_OTP_COOLDOWN,
      cookieKey: bindings.data.FLOW_COOKIE_KEY,
      purpose: "synthetic",
      identifier: payload.data.key,
    }).reserve(now)
    if (!reserved.success) return errorResponse(c, reserved.errorMessage)

    const metadata = cooldownMetadataCreate(reserved.data.expiresAt, now)
    if (!reserved.data.accepted) return cooldownLimitedResponse(c, metadata)

    cooldownMetadataHeadersSet(c, metadata)
    return c.json(resultCreate(metadata), 200)
  })

  return app
}
