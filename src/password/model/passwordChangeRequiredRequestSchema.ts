import * as v from "valibot"

const passwordSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(200))

export const passwordChangeRequiredRequestSchema = v.strictObject({
  currentPassword: passwordSchema,
  newPassword: passwordSchema,
  csrfToken: v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{43}$/)),
})

export type PasswordChangeRequiredRequest = v.InferOutput<typeof passwordChangeRequiredRequestSchema>
