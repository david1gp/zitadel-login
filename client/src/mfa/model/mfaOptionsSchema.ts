import * as v from "valibot"
import { mfaMethodSummarySchema } from "./mfaMethodSummarySchema"

export const mfaOptionsSchema = v.variant("mode", [
  v.strictObject({
    mode: v.literal("check"),
    method: mfaMethodSummarySchema,
  }),
  v.strictObject({
    mode: v.literal("select"),
    methods: v.pipe(v.array(mfaMethodSummarySchema), v.minLength(2), v.maxLength(5)),
  }),
  v.strictObject({
    mode: v.literal("enroll"),
    methods: v.pipe(v.array(mfaMethodSummarySchema), v.minLength(1), v.maxLength(5)),
  }),
  v.strictObject({
    mode: v.literal("skip"),
    reason: v.picklist(["factor_satisfied", "optional_setup"]),
    methods: v.pipe(v.array(mfaMethodSummarySchema), v.maxLength(5)),
  }),
  v.strictObject({
    mode: v.literal("fallback"),
    reason: v.picklist(["recovery_code", "unsupported_branch"]),
  }),
])

export type MfaOptions = v.InferOutput<typeof mfaOptionsSchema>
