import * as v from "valibot"

export const passwordRecoveryBootstrapViewSchema = v.strictObject({
  status: v.literal("ready"),
  csrfToken: v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{43}$/)),
  expiresAt: v.pipe(v.number(), v.integer(), v.minValue(1)),
})

export type PasswordRecoveryBootstrapView = v.InferOutput<typeof passwordRecoveryBootstrapViewSchema>
