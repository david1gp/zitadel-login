export function passwordRecoveryErrorMessageGet(code: string): string {
  if (code === "capability_disabled") return "Password recovery is not available."
  if (code === "rate_limited") return "Too many recovery attempts. Please retry later."
  if (code === "csrf_rejected") return "Request verification failed. Please start again."
  if (code === "invalid_link") return "This password reset link is invalid or has expired."
  if (code === "password_policy_invalid") return "This password does not meet the password policy."
  if (
    code === "recovery_state_expired" ||
    code === "recovery_state_invalid" ||
    code === "recovery_state_replayed" ||
    code === "recovery_state_unavailable"
  ) {
    return "This password recovery request has expired. Please start again."
  }
  return "Password recovery is temporarily unavailable. Please try again."
}
