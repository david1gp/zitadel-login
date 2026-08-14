import * as v from "valibot"

import { lastUsedLoginMethodPrimarySchema } from "./lastUsedLoginMethodPrimarySchema"

export const lastUsedLoginMethodCandidateSchema = v.strictObject({
  version: v.literal(1),
  organizationId: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  primary: lastUsedLoginMethodPrimarySchema,
})

export type LastUsedLoginMethodCandidate = v.InferOutput<typeof lastUsedLoginMethodCandidateSchema>
