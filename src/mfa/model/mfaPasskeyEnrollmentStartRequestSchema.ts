import * as v from "valibot"

export const mfaPasskeyEnrollmentStartRequestSchema = v.strictObject({
  method: v.literal("passkey"),
  csrfToken: v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{43}$/)),
})

export type MfaPasskeyEnrollmentStartRequest = v.InferOutput<typeof mfaPasskeyEnrollmentStartRequestSchema>
