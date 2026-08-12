import { flowV2ErrorMessageGet } from "../../flow/model/flowV2ErrorMessageGet"

export function passwordChangeErrorMessageGet(code: string): string {
  if (code === "credentials_invalid") return "Your current password is incorrect."
  if (code === "password_policy_invalid") return "This password does not meet the password policy."
  if (code === "session_stale") return "The sign-in session is invalid or has expired."
  return flowV2ErrorMessageGet(code)
}
