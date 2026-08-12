export type PasswordResetSetOutcome =
  | { status: "complete" }
  | { status: "retryable"; errorMessage: string; csrfToken: string; expiresAt: number }
  | { status: "terminal"; errorMessage: string }
