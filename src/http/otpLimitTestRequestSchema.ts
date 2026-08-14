import * as v from "valibot"

export const otpLimitTestRequestSchema = v.strictObject({
  bucket: v.picklist(["synthetic"]),
  key: v.pipe(v.string(), v.minLength(1), v.maxLength(64), v.regex(/^[A-Za-z0-9._~-]+$/)),
})

export type OtpLimitTestRequest = v.InferOutput<typeof otpLimitTestRequestSchema>
