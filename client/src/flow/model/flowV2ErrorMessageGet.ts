export function flowV2ErrorMessageGet(code: string): string {
  if (code === "account_invalid") return "The selected account is no longer valid."
  if (code === "credentials_invalid") return "Invalid username or password."
  if (code === "password_unavailable") return "Password sign-in is temporarily unavailable."
  if (code === "passkey_unavailable") return "Passkey sign-in is temporarily unavailable."
  if (code === "challenge_unavailable") return "Passkey challenge is temporarily unavailable."
  if (code === "code_invalid") return "The code is invalid or expired."
  if (code === "rate_limited") return "Too many sign-in attempts. Please retry later."
  if (code === "csrf_rejected") return "Request verification failed."
  if (code === "request_rejected") return "The sign-in request is no longer valid."
  if (code === "flow_unknown" || code === "flow_invalid" || code === "flow_expired") {
    return "The sign-in session is invalid or has expired."
  }
  if (code === "flow_replayed") return "The sign-in request was already completed."
  if (code === "flow_stage_invalid") return "The sign-in request is in an invalid state."
  if (code === "challenge_expired") return "The verification code has expired."
  if (code === "mfa_skip_forbidden") return "Skipping 2-step verification is not allowed for this account."
  if (code === "fallback_forbidden") return "Interactive sign-in is not allowed for this request."
  if (code === "service_unavailable") return "The sign-in service is temporarily unavailable."
  if (code.includes(" ")) return code
  return "Sign-in could not be completed. Please try again."
}
