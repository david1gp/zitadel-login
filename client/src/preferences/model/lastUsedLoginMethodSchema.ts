import * as v from "valibot"
import { lastUsedLoginMethodPrimarySchema } from "./lastUsedLoginMethodPrimarySchema"

export const lastUsedLoginMethodSchema = v.strictObject({
  version: v.literal(1),
  primary: v.optional(lastUsedLoginMethodPrimarySchema),
  mfa: v.optional(v.picklist(["totp", "email_otp", "sms_otp", "u2f", "passkey"])),
})

export type LastUsedLoginMethod = v.InferOutput<typeof lastUsedLoginMethodSchema>
