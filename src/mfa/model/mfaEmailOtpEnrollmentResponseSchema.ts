import * as v from "valibot"

import { flowV2TransitionSchema } from "../../flow/model/flowV2TransitionSchema"

export const mfaEmailOtpEnrollmentResponseSchema = v.strictObject({
  transition: flowV2TransitionSchema,
})

export type MfaEmailOtpEnrollmentResponse = v.InferOutput<typeof mfaEmailOtpEnrollmentResponseSchema>
