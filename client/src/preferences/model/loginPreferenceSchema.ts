import * as v from "valibot"

const commonEntries = {
  version: v.literal(1),
  rememberIdentifier: v.boolean(),
  identifier: v.optional(v.pipe(v.string(), v.maxLength(254))),
  updatedAt: v.pipe(v.number(), v.integer(), v.minValue(0)),
}

export const loginPreferenceSchema = v.variant("selectedMethod", [
  v.strictObject({ ...commonEntries, selectedMethod: v.literal("email_otp") }),
  v.strictObject({ ...commonEntries, selectedMethod: v.literal("password") }),
  v.strictObject({ ...commonEntries, selectedMethod: v.literal("passkey") }),
  v.strictObject({
    ...commonEntries,
    selectedMethod: v.literal("identity_provider"),
    identityProviderId: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  }),
])

export type LoginPreference = v.InferOutput<typeof loginPreferenceSchema>
