import * as v from "valibot"

import { resultCreate } from "../result/resultCreate"
import { resultErrorCreate } from "../result/resultErrorCreate"
import { flowCookieSchema } from "./flowCookieSchema"

const decoder = new TextDecoder()
const additionalData = new TextEncoder().encode("__Host-zitadel-login-flow:v1")

function base64UrlDecode(value: string): Uint8Array {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (value.length % 4)) % 4)
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
}

function bytesCopy(value: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(value.byteLength)
  copy.set(value)
  return copy
}

export async function flowCookieOpen(value: string, keyValue: string, now: number) {
  const op = "flowCookieOpen"
  try {
    const bytes = base64UrlDecode(value)
    if (bytes.length <= 28) return resultErrorCreate(op, "Invalid flow state")

    const key = await crypto.subtle.importKey("raw", bytesCopy(base64UrlDecode(keyValue)), "AES-GCM", false, [
      "decrypt",
    ])
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytesCopy(bytes.slice(0, 12)), additionalData },
      key,
      bytesCopy(bytes.slice(12)),
    )
    const parsed = v.safeParse(flowCookieSchema, JSON.parse(decoder.decode(decrypted)))
    if (!parsed.success || parsed.output.expiresAt <= now || parsed.output.issuedAt > now + 60) {
      return resultErrorCreate(op, "Invalid or expired flow state")
    }
    return resultCreate(parsed.output)
  } catch {
    return resultErrorCreate(op, "Invalid flow state")
  }
}
