import * as v from "valibot"

export const passwordRecoveryBootstrapResponseSchema = v.variant("success", [
  v.strictObject({
    success: v.literal(true),
    data: v.strictObject({
      status: v.literal("ready"),
      csrfToken: v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{43}$/)),
      expiresAt: v.pipe(v.number(), v.integer(), v.minValue(1)),
    }),
  }),
  v.strictObject({
    success: v.literal(false),
    op: v.literal("passwordRecoveryBootstrap"),
    errorMessage: v.picklist([
      "capability_disabled",
      "invalid_payload",
      "origin_rejected",
      "recovery_state_unavailable",
      "service_unavailable",
      "unsupported_media_type",
    ]),
  }),
])
