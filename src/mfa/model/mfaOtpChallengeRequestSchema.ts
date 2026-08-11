import * as v from "valibot"

export const mfaOtpChallengeRequestSchema = v.strictObject({
  method: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(50))),
  csrfToken: v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{43}$/)),
})

export type MfaOtpChallengeRequest = v.InferOutput<typeof mfaOtpChallengeRequestSchema>
