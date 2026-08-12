import * as v from "valibot"

import { flowV2TransitionSchema } from "../../flow/model/flowV2TransitionSchema"

export const mfaTotpEnrollmentVerifyResponseSchema = v.strictObject({
  transition: flowV2TransitionSchema,
})

export type MfaTotpEnrollmentVerifyResponse = v.InferOutput<typeof mfaTotpEnrollmentVerifyResponseSchema>
