import * as v from "valibot"

export const emailOtpCooldownReserveResultSchema = v.strictObject({
  accepted: v.boolean(),
  expiresAt: v.pipe(v.number(), v.integer(), v.minValue(0)),
})

export type EmailOtpCooldownReserveResult = v.InferOutput<typeof emailOtpCooldownReserveResultSchema>
