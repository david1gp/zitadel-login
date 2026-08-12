import * as v from "valibot"

export const passwordResetRequestResponseSchema = v.variant("success", [
  v.strictObject({
    success: v.literal(true),
    data: v.strictObject({ status: v.literal("accepted") }),
  }),
  v.strictObject({
    success: v.literal(false),
    op: v.literal("passwordResetRequest"),
    errorMessage: v.picklist([
      "capability_disabled",
      "csrf_rejected",
      "invalid_payload",
      "origin_rejected",
      "rate_limited",
      "recovery_state_expired",
      "recovery_state_invalid",
      "recovery_state_replayed",
      "service_unavailable",
      "unsupported_media_type",
    ]),
  }),
])
