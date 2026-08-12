import * as v from "valibot"

const baseSchema = {
  version: v.literal(1),
  purpose: v.literal("password_reset"),
  userId: v.pipe(v.string(), v.minLength(1), v.maxLength(200), v.regex(/^[A-Za-z0-9._~-]+$/)),
  organizationId: v.pipe(v.string(), v.minLength(1), v.maxLength(200), v.regex(/^[A-Za-z0-9._~-]+$/)),
  verificationCode: v.pipe(v.string(), v.minLength(1), v.maxLength(20), v.regex(/^[A-Za-z0-9-]+$/)),
  issuedAt: v.pipe(v.number(), v.integer(), v.minValue(0)),
  expiresAt: v.pipe(v.number(), v.integer(), v.minValue(1)),
}

export const passwordResetCookieSchema = v.pipe(
  v.variant("transition", [
    v.strictObject({ ...baseSchema, transition: v.literal(0) }),
    v.strictObject({
      ...baseSchema,
      transition: v.literal(1),
      csrfToken: v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{43}$/)),
    }),
  ]),
  v.check(
    (state) => state.expiresAt > state.issuedAt && state.expiresAt <= state.issuedAt + 600,
    "Invalid password reset state lifetime",
  ),
)

export type PasswordResetCookie = v.InferOutput<typeof passwordResetCookieSchema>
