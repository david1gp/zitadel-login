const encoder = new TextEncoder()

function base64UrlEncode(value: Uint8Array): string {
  let binary = ""
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
}

function base64UrlDecode(value: string): Uint8Array {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (value.length % 4)) % 4)
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
}

function bytesCopy(value: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(value.byteLength)
  copy.set(value)
  return copy
}

export async function opaqueAccountIdCreate(secretKey: string, sessionId: string, userId: string): Promise<string> {
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      bytesCopy(base64UrlDecode(secretKey)),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    )
    const signed = await crypto.subtle.sign("HMAC", key, encoder.encode(`${sessionId}\u0000${userId}`))
    return `acc_${base64UrlEncode(new Uint8Array(signed).slice(0, 16))}`
  } catch {
    return `acc_${base64UrlEncode(encoder.encode(`${sessionId}:${userId}`)).slice(0, 22)}`
  }
}
