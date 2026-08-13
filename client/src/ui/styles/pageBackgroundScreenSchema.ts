import * as v from "valibot"

export const pageBackgroundScreenSchema = v.picklist([
  "chooser",
  "directory",
  "loading",
  "fatal",
  "email_otp",
  "password",
  "password_change",
  "passkey",
  "identity_provider",
  "mfa",
  "password_recovery",
  "password_reset",
  "unsupported",
])

export type PageBackgroundScreen = v.InferOutput<typeof pageBackgroundScreenSchema>
