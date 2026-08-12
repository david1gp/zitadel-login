import * as v from "valibot"

export const passwordResetIngressResponseSchema = v.strictObject({
  success: v.literal(false),
  op: v.literal("passwordResetIngress"),
  errorMessage: v.picklist(["capability_disabled", "invalid_link", "service_unavailable"]),
})
