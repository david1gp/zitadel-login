import * as v from "valibot"

import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import { recentAccountCookieSchema, type RecentAccountCookie } from "../model/recentAccountCookieSchema"

const cookieName = "__Host-zitadel-login-accounts"
const encoder = new TextEncoder()
const encodedValueSchema = v.pipe(v.string(), v.minLength(40), v.maxLength(3800), v.regex(/^[A-Za-z0-9_-]+$/))
const maximumPlaintextBytes = 2800

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

export async function recentAccountCookieSeal(cookie: RecentAccountCookie, keyValue: string, iv: Uint8Array) {
  const op = "recentAccountCookieSeal"
  const parsed = v.safeParse(recentAccountCookieSchema, cookie)
  if (!parsed.success || iv.byteLength !== 12) return resultErrorCreate(op, "recent_account_unavailable")

  try {
    const plaintext = encoder.encode(JSON.stringify(parsed.output))
    if (plaintext.byteLength > maximumPlaintextBytes) return resultErrorCreate(op, "recent_account_unavailable")
    const key = await crypto.subtle.importKey("raw", bytesCopy(base64UrlDecode(keyValue)), "AES-GCM", false, [
      "encrypt",
    ])
    const encrypted = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: bytesCopy(iv),
        additionalData: encoder.encode(`${cookieName}:schema-1`),
      },
      key,
      plaintext,
    )
    const output = new Uint8Array(iv.byteLength + encrypted.byteLength)
    output.set(iv)
    output.set(new Uint8Array(encrypted), iv.byteLength)
    const encoded = base64UrlEncode(output)
    if (!v.safeParse(encodedValueSchema, encoded).success) return resultErrorCreate(op, "recent_account_unavailable")
    return resultCreate(encoded)
  } catch {
    return resultErrorCreate(op, "recent_account_unavailable")
  }
}
