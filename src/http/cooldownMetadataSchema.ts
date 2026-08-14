import * as v from "valibot"

export const cooldownMetadataSchema = v.strictObject({
  cooldownExpiresAt: v.pipe(v.number(), v.integer(), v.minValue(0)),
  cooldownRemainingSeconds: v.pipe(v.number(), v.integer(), v.minValue(0)),
})

export type CooldownMetadata = v.InferOutput<typeof cooldownMetadataSchema>
