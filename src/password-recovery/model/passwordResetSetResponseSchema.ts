import * as v from "valibot"

export const passwordResetSetResponseSchema = v.variant("success", [
  v.strictObject({
    success: v.literal(true),
    data: v.strictObject({ status: v.literal("complete") }),
  }),
  v.strictObject({
    success: v.literal(false),
    op: v.literal("passwordResetSet"),
    errorMessage: v.literal("password_policy_invalid"),
    csrfToken: v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{43}$/)),
    expiresAt: v.pipe(v.number(), v.integer(), v.minValue(1)),
  }),
  v.strictObject({
    success: v.literal(false),
    op: v.literal("passwordResetSet"),
    errorMessage: v.picklist([
      "capability_disabled",
      "csrf_rejected",
      "invalid_link",
      "invalid_payload",
      "origin_rejected",
      "service_unavailable",
      "unsupported_media_type",
    ]),
  }),
])
