import * as v from "valibot"

import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import type { EmailOtpCooldownPurpose } from "./emailOtpCooldownPurposeSchema"
import { emailOtpCooldownPurposeSchema } from "./emailOtpCooldownPurposeSchema"

const identifierSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(200))

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

export async function emailOtpCooldownObjectNameCreate(
  cookieKey: string,
  purpose: EmailOtpCooldownPurpose,
  identifier: string,
) {
  const op = "emailOtpCooldownObjectNameCreate"
  const parsedPurpose = v.safeParse(emailOtpCooldownPurposeSchema, purpose)
  if (!parsedPurpose.success) return resultErrorCreate(op, "cooldown_unavailable")
  const parsedIdentifier = v.safeParse(identifierSchema, identifier)
  if (!parsedIdentifier.success) return resultErrorCreate(op, "cooldown_unavailable")

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      bytesCopy(base64UrlDecode(cookieKey)),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    )
    const signed = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${parsedPurpose.output}\u0000${parsedIdentifier.output}`),
    )
    return resultCreate(`${parsedPurpose.output}:${base64UrlEncode(new Uint8Array(signed))}`)
  } catch {
    return resultErrorCreate(op, "cooldown_unavailable")
  }
}
