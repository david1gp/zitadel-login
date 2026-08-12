import * as v from "valibot"

import { flowV2TransitionSchema } from "../../flow/model/flowV2TransitionSchema"

export const mfaTotpEnrollmentSetupSchema = v.strictObject({
  provisioningUri: v.pipe(v.string(), v.regex(/^otpauth:\/\/totp\//), v.maxLength(2048)),
  secret: v.pipe(v.string(), v.regex(/^[A-Z2-7]+$/), v.minLength(1), v.maxLength(256)),
  transition: flowV2TransitionSchema,
})

export type MfaTotpEnrollmentSetup = v.InferOutput<typeof mfaTotpEnrollmentSetupSchema>
