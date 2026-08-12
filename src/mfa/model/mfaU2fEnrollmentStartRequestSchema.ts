import * as v from "valibot"

export const mfaU2fEnrollmentStartRequestSchema = v.strictObject({
  method: v.literal("u2f"),
  csrfToken: v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{43}$/)),
})

export type MfaU2fEnrollmentStartRequest = v.InferOutput<typeof mfaU2fEnrollmentStartRequestSchema>
