export function passkeyRegistrationErrorClassify(error: unknown): string {
  const name = error && typeof error === "object" && "name" in error ? String(error.name) : ""
  if (name === "NotAllowedError") return "Security key registration was canceled or timed out."
  if (name === "InvalidStateError") return "This device is already registered for your account."
  if (name === "SecurityError") return "Security key registration security error. Please check domain or origin."
  if (name === "NotSupportedError") return "This device does not support the required registration options."
  if (name === "AbortError") return "Security key registration was canceled."
  if (error instanceof Error && error.message && !error.message.startsWith("[object")) return error.message
  return "Security key registration failed. Please try again."
}
