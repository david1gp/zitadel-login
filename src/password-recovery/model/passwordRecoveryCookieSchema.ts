import * as v from "valibot"

export const passwordRecoveryCookieSchema = v.pipe(
  v.strictObject({
    version: v.literal(1),
    purpose: v.literal("password_recovery"),
    csrfToken: v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{43}$/)),
    issuedAt: v.pipe(v.number(), v.integer(), v.minValue(0)),
    expiresAt: v.pipe(v.number(), v.integer(), v.minValue(1)),
    transition: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(10)),
  }),
  v.check(
    (state) => state.expiresAt > state.issuedAt && state.expiresAt <= state.issuedAt + 600,
    "Invalid recovery state lifetime",
  ),
)

export type PasswordRecoveryCookie = v.InferOutput<typeof passwordRecoveryCookieSchema>
