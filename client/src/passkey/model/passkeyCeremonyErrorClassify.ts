export function passkeyCeremonyErrorClassify(error: unknown): string {
  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    if (error.name === "NotAllowedError") {
      return "Passkey sign-in was canceled or timed out."
    }
    if (error.name === "SecurityError") {
      return "Passkey sign-in security error. Please check domain or origin."
    }
    if (error.name === "NotSupportedError" || error.name === "InvalidStateError") {
      return "This passkey is not supported or not registered on this device."
    }
  }
  if (error && typeof error === "object" && "name" in error) {
    const name = String(error.name)
    if (name === "NotAllowedError") return "Passkey sign-in was canceled or timed out."
    if (name === "SecurityError") return "Passkey sign-in security error. Please check domain or origin."
    if (name === "NotSupportedError" || name === "InvalidStateError") {
      return "This passkey is not supported or not registered on this device."
    }
  }
  if (error instanceof Error && error.message && !error.message.startsWith("[object")) {
    return error.message
  }
  return "Passkey sign-in failed. Please try again."
}
