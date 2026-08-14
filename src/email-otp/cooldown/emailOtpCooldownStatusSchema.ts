import * as v from "valibot"

export const emailOtpCooldownStatusSchema = v.strictObject({
  expiresAt: v.pipe(v.number(), v.integer(), v.minValue(0)),
})

export type EmailOtpCooldownStatus = v.InferOutput<typeof emailOtpCooldownStatusSchema>
