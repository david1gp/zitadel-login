import { resultCreate } from "../result/resultCreate"
import { resultErrorCreate } from "../result/resultErrorCreate"
import type { FlowCookie } from "./flowCookieSchema"

const encoder = new TextEncoder()
const additionalData = encoder.encode("__Host-zitadel-login-flow:v1")

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

export async function flowCookieSeal(cookie: FlowCookie, keyValue: string, iv: Uint8Array) {
  const op = "flowCookieSeal"
  try {
    const key = await crypto.subtle.importKey("raw", bytesCopy(base64UrlDecode(keyValue)), "AES-GCM", false, [
      "encrypt",
    ])
    const plaintext = encoder.encode(JSON.stringify(cookie))
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: bytesCopy(iv), additionalData },
      key,
      plaintext,
    )
    const value = new Uint8Array(iv.length + encrypted.byteLength)
    value.set(iv)
    value.set(new Uint8Array(encrypted), iv.length)
    return resultCreate(base64UrlEncode(value))
  } catch {
    return resultErrorCreate(op, "Unable to protect flow state")
  }
}
