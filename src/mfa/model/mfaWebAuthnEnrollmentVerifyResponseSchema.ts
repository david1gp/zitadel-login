import * as v from "valibot"

import { flowV2TransitionSchema } from "../../flow/model/flowV2TransitionSchema"

export const mfaWebAuthnEnrollmentVerifyResponseSchema = v.strictObject({
  transition: flowV2TransitionSchema,
})

export type MfaWebAuthnEnrollmentVerifyResponse = v.InferOutput<typeof mfaWebAuthnEnrollmentVerifyResponseSchema>
