import * as v from "valibot"

export const passwordResetSetBootstrapResponseSchema = v.variant("success", [
  v.strictObject({
    success: v.literal(true),
    data: v.strictObject({
      status: v.literal("ready"),
      screen: v.literal("password_reset"),
      csrfToken: v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{43}$/)),
      expiresAt: v.pipe(v.number(), v.integer(), v.minValue(1)),
    }),
  }),
  v.strictObject({
    success: v.literal(false),
    op: v.literal("passwordResetSetBootstrap"),
    errorMessage: v.picklist([
      "capability_disabled",
      "invalid_link",
      "invalid_payload",
      "origin_rejected",
      "service_unavailable",
      "unsupported_media_type",
    ]),
  }),
])
