import * as v from "valibot"

export const passwordResetIngressQuerySchema = v.strictObject({
  userId: v.pipe(v.string(), v.minLength(1), v.maxLength(200), v.regex(/^[A-Za-z0-9._~-]+$/)),
  orgId: v.pipe(v.string(), v.minLength(1), v.maxLength(200), v.regex(/^[A-Za-z0-9._~-]+$/)),
  code: v.pipe(v.string(), v.minLength(1), v.maxLength(20), v.regex(/^[A-Za-z0-9-]+$/)),
})

export type PasswordResetIngressQuery = v.InferOutput<typeof passwordResetIngressQuerySchema>
