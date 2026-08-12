import * as v from "valibot"
import { flowV2TransitionSchema } from "../../flow/model/flowV2TransitionSchema"

const errorMessageSchema = v.picklist([
  "origin_rejected",
  "unsupported_media_type",
  "invalid_payload",
  "invalid_query",
  "flow_unknown",
  "flow_invalid",
  "flow_expired",
  "flow_replayed",
  "flow_stage_invalid",
  "csrf_rejected",
  "rate_limited",
  "rate_limiter_unavailable",
  "session_stale",
  "credentials_invalid",
  "password_policy_invalid",
  "password_unavailable",
  "authorization_unavailable",
  "service_unavailable",
])

const errorSchema = v.strictObject({
  success: v.literal(false),
  op: v.literal("passwordChangeRequired"),
  errorMessage: errorMessageSchema,
})

const retrySchema = v.strictObject({
  success: v.literal(false),
  op: v.literal("passwordChangeRequired"),
  errorMessage: v.picklist(["credentials_invalid", "password_policy_invalid"]),
  csrfToken: v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{43}$/)),
  expiresAt: v.pipe(v.number(), v.integer()),
})

const successSchema = v.strictObject({
  success: v.literal(true),
  data: flowV2TransitionSchema,
})

export const passwordChangeRequiredResponseSchema = v.union([successSchema, retrySchema, errorSchema])

export type PasswordChangeRequiredResponse = v.InferOutput<typeof passwordChangeRequiredResponseSchema>
