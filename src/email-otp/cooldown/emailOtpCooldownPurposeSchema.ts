import * as v from "valibot"

export const emailOtpCooldownPurposeSchema = v.picklist(["email-otp", "mfa-email-otp", "synthetic"])

export type EmailOtpCooldownPurpose = v.InferOutput<typeof emailOtpCooldownPurposeSchema>
