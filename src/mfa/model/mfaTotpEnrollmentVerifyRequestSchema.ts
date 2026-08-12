import * as v from "valibot"

export const mfaTotpEnrollmentVerifyRequestSchema = v.strictObject({
  code: v.pipe(v.string(), v.regex(/^\d{6}$/)),
  csrfToken: v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{43}$/)),
})

export type MfaTotpEnrollmentVerifyRequest = v.InferOutput<typeof mfaTotpEnrollmentVerifyRequestSchema>
