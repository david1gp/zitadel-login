import * as v from "valibot"

export const recentAccountSummarySchema = v.strictObject({
  id: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  label: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  avatarUrl: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(2048))),
  lastUsedAt: v.pipe(v.number(), v.integer(), v.minValue(0)),
  reauthenticationRequired: v.boolean(),
})

export type RecentAccountSummary = v.InferOutput<typeof recentAccountSummarySchema>
