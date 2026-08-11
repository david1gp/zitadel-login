import * as v from "valibot"

export const loginMethodSelectionSchema = v.variant("method", [
  v.strictObject({ method: v.literal("email_otp") }),
  v.strictObject({ method: v.literal("password") }),
  v.strictObject({ method: v.literal("passkey") }),
  v.strictObject({
    method: v.literal("mfa"),
    factor: v.optional(v.picklist(["totp", "email_otp", "sms_otp", "u2f", "passkey"])),
  }),
  v.strictObject({
    method: v.literal("identity_provider"),
    identityProviderId: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
    subroute: v.optional(v.picklist(["failure", "account-not-found", "linking-failed", "registration-failed"])),
  }),
])

export type LoginMethodSelection = v.InferOutput<typeof loginMethodSelectionSchema>
