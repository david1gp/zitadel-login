import * as v from "valibot"

export const mfaTotpEnrollmentStartRequestSchema = v.strictObject({
  method: v.literal("totp"),
  csrfToken: v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{43}$/)),
})

export type MfaTotpEnrollmentStartRequest = v.InferOutput<typeof mfaTotpEnrollmentStartRequestSchema>
