import * as v from "valibot"

export const mfaEmailOtpEnrollmentRequestSchema = v.strictObject({
  method: v.literal("email_otp"),
  csrfToken: v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{43}$/)),
})

export type MfaEmailOtpEnrollmentRequest = v.InferOutput<typeof mfaEmailOtpEnrollmentRequestSchema>
