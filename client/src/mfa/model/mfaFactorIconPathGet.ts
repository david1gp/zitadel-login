import { mdiCellphoneMessage } from "@adaptive-ds/mdi/mdiCellphoneMessage.js"
import { mdiEmailOutline } from "@adaptive-ds/mdi/mdiEmailOutline.js"
import { mdiFingerprint } from "@adaptive-ds/mdi/mdiFingerprint.js"
import { mdiShieldOutline } from "@adaptive-ds/mdi/mdiShieldOutline.js"
import { mdiTwoFactorAuthentication } from "@adaptive-ds/mdi/mdiTwoFactorAuthentication.js"
import { mdiUsbFlashDriveOutline } from "@adaptive-ds/mdi/mdiUsbFlashDriveOutline.js"

import type { MfaMethodSummary } from "./mfaMethodSummarySchema"

export function mfaFactorIconPathGet(type: MfaMethodSummary["type"] | string): string {
  if (type === "totp") return mdiTwoFactorAuthentication
  if (type === "email_otp") return mdiEmailOutline
  if (type === "sms_otp") return mdiCellphoneMessage
  if (type === "u2f") return mdiUsbFlashDriveOutline
  if (type === "passkey") return mdiFingerprint
  return mdiShieldOutline
}
