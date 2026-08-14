import * as v from "valibot"

export const lastUsedLoginMethodPrimarySchema = v.variant("method", [
  v.strictObject({ method: v.literal("email_otp") }),
  v.strictObject({ method: v.literal("password") }),
  v.strictObject({ method: v.literal("passkey") }),
  v.strictObject({
    method: v.literal("identity_provider"),
    identityProviderId: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  }),
])

export type LastUsedLoginMethodPrimary = v.InferOutput<typeof lastUsedLoginMethodPrimarySchema>
