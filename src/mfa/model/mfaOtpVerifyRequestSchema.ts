import * as v from "valibot"

export const mfaOtpVerifyRequestSchema = v.strictObject({
  code: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(20), v.regex(/^[A-Za-z0-9-]+$/)),
  method: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(50))),
  csrfToken: v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{43}$/)),
})

export type MfaOtpVerifyRequest = v.InferOutput<typeof mfaOtpVerifyRequestSchema>
