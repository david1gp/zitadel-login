import { mdiAccountOffOutline } from "@adaptive-ds/mdi/mdiAccountOffOutline.js"
import { mdiAccountPlusOutline } from "@adaptive-ds/mdi/mdiAccountPlusOutline.js"
import { mdiAlertCircleOutline } from "@adaptive-ds/mdi/mdiAlertCircleOutline.js"
import { mdiCellphoneMessage } from "@adaptive-ds/mdi/mdiCellphoneMessage.js"
import { mdiCheckCircleOutline } from "@adaptive-ds/mdi/mdiCheckCircleOutline.js"
import { mdiEmailCheckOutline } from "@adaptive-ds/mdi/mdiEmailCheckOutline.js"
import { mdiEmailOutline } from "@adaptive-ds/mdi/mdiEmailOutline.js"
import { mdiFingerprint } from "@adaptive-ds/mdi/mdiFingerprint.js"
import { mdiFormTextboxPassword } from "@adaptive-ds/mdi/mdiFormTextboxPassword.js"
import { mdiGoogle } from "@adaptive-ds/mdi/mdiGoogle.js"
import { mdiHelpCircleOutline } from "@adaptive-ds/mdi/mdiHelpCircleOutline.js"
import { mdiLinkOff } from "@adaptive-ds/mdi/mdiLinkOff.js"
import { mdiLoading } from "@adaptive-ds/mdi/mdiLoading.js"
import { mdiLockQuestion } from "@adaptive-ds/mdi/mdiLockQuestion.js"
import { mdiLockReset } from "@adaptive-ds/mdi/mdiLockReset.js"
import { mdiLogin } from "@adaptive-ds/mdi/mdiLogin.js"
import { mdiQrcode } from "@adaptive-ds/mdi/mdiQrcode.js"
import { mdiRefresh } from "@adaptive-ds/mdi/mdiRefresh.js"
import { mdiShieldOutline } from "@adaptive-ds/mdi/mdiShieldOutline.js"
import { mdiShieldPlus } from "@adaptive-ds/mdi/mdiShieldPlus.js"
import { mdiSkipNext } from "@adaptive-ds/mdi/mdiSkipNext.js"
import { mdiTwoFactorAuthentication } from "@adaptive-ds/mdi/mdiTwoFactorAuthentication.js"
import { mdiUsbFlashDriveOutline } from "@adaptive-ds/mdi/mdiUsbFlashDriveOutline.js"
import { mdiViewList } from "@adaptive-ds/mdi/mdiViewList.js"

export function demoScenarioIconPathGet(id: string): string {
  if (id === "directory" || id.startsWith("chooser")) return mdiViewList
  if (id === "loading" || id === "recovery-loading" || id === "reset-loading" || id === "mfa-loading") return mdiLoading
  if (id === "continuing" || id === "mfa-fallback") return mdiLogin
  if (id === "fatal" || id === "recovery-fatal" || id.endsWith("-unavailable") || id === "idp-failure")
    return mdiAlertCircleOutline
  if (id.startsWith("email-otp") || id.startsWith("mfa-email-otp")) return mdiEmailOutline
  if (id.startsWith("password-change") || id === "reset") return mdiLockReset
  if (id.startsWith("password")) return mdiFormTextboxPassword
  if (id.startsWith("passkey") || id === "mfa-passkey" || id === "mfa-webauthn-enroll") return mdiFingerprint
  if (id === "idp") return mdiGoogle
  if (id === "idp-account-not-found") return mdiAccountOffOutline
  if (id === "idp-linking-failed") return mdiLinkOff
  if (id === "idp-registration-failed") return mdiAccountPlusOutline
  if (id === "mfa-select") return mdiShieldOutline
  if (id === "mfa-enroll") return mdiShieldPlus
  if (id === "mfa-skip-optional") return mdiSkipNext
  if (id === "mfa-skip-satisfied" || id === "reset-complete") return mdiCheckCircleOutline
  if (id === "mfa-retry") return mdiRefresh
  if (id === "mfa-totp" || id.startsWith("mfa-totp-enroll")) return mdiTwoFactorAuthentication
  if (id === "mfa-sms-otp") return mdiCellphoneMessage
  if (id.startsWith("mfa-u2f")) return mdiUsbFlashDriveOutline
  if (id.startsWith("mfa-totp")) return mdiQrcode
  if (id === "recovery-request") return mdiLockQuestion
  if (id === "recovery-sent") return mdiEmailCheckOutline
  if (id === "reset-invalid") return mdiLinkOff
  if (id === "unsupported") return mdiHelpCircleOutline
  if (id.startsWith("mfa")) return mdiShieldOutline
  return mdiViewList
}
