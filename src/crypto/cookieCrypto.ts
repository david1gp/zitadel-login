const decoder = new TextDecoder()
const encoder = new TextEncoder()

function base64UrlDecode(value: string): Uint8Array {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (value.length % 4)) % 4)
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
}

function base64UrlEncode(value: Uint8Array): string {
  let binary = ""
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
}

function bytesCopy(value: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(value.byteLength)
  copy.set(value)
  return copy
}

export const cookieCrypto = {
  decode(value: string): Uint8Array {
    return base64UrlDecode(value)
  },
  decodeText(value: Uint8Array): string {
    return decoder.decode(value)
  },
  encodeText(value: string): Uint8Array {
    return encoder.encode(value)
  },
  async decrypt(value: Uint8Array, keyValue: string, additionalData: Uint8Array): Promise<ArrayBuffer> {
    const key = await crypto.subtle.importKey("raw", bytesCopy(base64UrlDecode(keyValue)), "AES-GCM", false, [
      "decrypt",
    ])
    return crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytesCopy(value.slice(0, 12)), additionalData: bytesCopy(additionalData) },
      key,
      bytesCopy(value.slice(12)),
    )
  },
  async encrypt(plaintext: Uint8Array, keyValue: string, iv: Uint8Array, additionalData: Uint8Array): Promise<string> {
    const key = await crypto.subtle.importKey("raw", bytesCopy(base64UrlDecode(keyValue)), "AES-GCM", false, [
      "encrypt",
    ])
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: bytesCopy(iv), additionalData: bytesCopy(additionalData) },
      key,
      bytesCopy(plaintext),
    )
    const output = new Uint8Array(iv.byteLength + encrypted.byteLength)
    output.set(iv)
    output.set(new Uint8Array(encrypted), iv.byteLength)
    return base64UrlEncode(output)
  },
}
