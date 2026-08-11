import * as v from "valibot"

export const mfaMethodSummarySchema = v.strictObject({
  type: v.picklist(["totp", "email_otp", "sms_otp", "u2f", "passkey"]),
})

export type MfaMethodSummary = v.InferOutput<typeof mfaMethodSummarySchema>
