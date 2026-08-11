import * as v from "valibot"

export const mfaU2fChallengeRequestSchema = v.strictObject({
  method: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(50))),
  rpId: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(253))),
  csrfToken: v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{43}$/)),
})

export type MfaU2fChallengeRequest = v.InferOutput<typeof mfaU2fChallengeRequestSchema>
