import * as v from "valibot"

import { flowV2TransitionSchema } from "../../flow/model/flowV2TransitionSchema"
import { passkeyCreationOptionsSchema } from "../../passkey/model/passkeyCreationOptionsSchema"

export const mfaWebAuthnEnrollmentStartResponseSchema = v.strictObject({
  options: passkeyCreationOptionsSchema,
  transition: flowV2TransitionSchema,
})

export type MfaWebAuthnEnrollmentStartResponse = v.InferOutput<typeof mfaWebAuthnEnrollmentStartResponseSchema>
