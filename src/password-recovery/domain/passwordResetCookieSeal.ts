import * as v from "valibot"

import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import { passwordResetCookieName } from "../model/passwordResetCookieName"
import { type PasswordResetCookie, passwordResetCookieSchema } from "../model/passwordResetCookieSchema"

const encoder = new TextEncoder()
const encodedValueSchema = v.pipe(v.string(), v.minLength(40), v.maxLength(1024), v.regex(/^[A-Za-z0-9_-]+$/))

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

export async function passwordResetCookieSeal(state: PasswordResetCookie, keyValue: string, iv: Uint8Array) {
  const op = "passwordResetCookieSeal"
  const parsed = v.safeParse(passwordResetCookieSchema, state)
  if (!parsed.success || iv.byteLength !== 12) return resultErrorCreate(op, "password_reset_state_unavailable")

  try {
    const key = await crypto.subtle.importKey("raw", bytesCopy(base64UrlDecode(keyValue)), "AES-GCM", false, [
      "encrypt",
    ])
    const encrypted = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: bytesCopy(iv),
        additionalData: encoder.encode(`${passwordResetCookieName}:schema-1`),
      },
      key,
      encoder.encode(JSON.stringify(parsed.output)),
    )
    const output = new Uint8Array(iv.byteLength + encrypted.byteLength)
    output.set(iv)
    output.set(new Uint8Array(encrypted), iv.byteLength)
    const encoded = base64UrlEncode(output)
    if (!v.safeParse(encodedValueSchema, encoded).success) {
      return resultErrorCreate(op, "password_reset_state_unavailable")
    }
    return resultCreate(encoded)
  } catch {
    return resultErrorCreate(op, "password_reset_state_unavailable")
  }
}
