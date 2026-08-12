import * as v from "valibot"

import { flowV2TransitionSchema } from "../../flow/model/flowV2TransitionSchema"
import { passkeyCreationOptionsSchema } from "../../passkey/model/passkeyCreationOptionsSchema"

export const mfaWebAuthnEnrollmentSetupSchema = v.strictObject({
  options: passkeyCreationOptionsSchema,
  transition: flowV2TransitionSchema,
})

export type MfaWebAuthnEnrollmentSetup = v.InferOutput<typeof mfaWebAuthnEnrollmentSetupSchema>
