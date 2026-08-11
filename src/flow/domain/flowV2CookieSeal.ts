import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import type { FlowV2Cookie } from "../model/flowV2CookieSchema"
import { flowV2CookieNameCreate } from "./flowV2CookieNameCreate"

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

export async function flowV2CookieSeal(state: FlowV2Cookie, keyValue: string, iv: Uint8Array) {
  const op = "flowV2CookieSeal"
  try {
    if (iv.byteLength !== 12) return resultErrorCreate(op, "flow_state_unavailable")
    const key = await crypto.subtle.importKey("raw", bytesCopy(base64UrlDecode(keyValue)), "AES-GCM", false, [
      "encrypt",
    ])
    const additionalData = encoder.encode(`${flowV2CookieNameCreate(state.flowHandle)}:schema-2`)
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: bytesCopy(iv), additionalData },
      key,
      encoder.encode(JSON.stringify(state)),
    )
    const output = new Uint8Array(iv.byteLength + encrypted.byteLength)
    output.set(iv)
    output.set(new Uint8Array(encrypted), iv.byteLength)
    return resultCreate(base64UrlEncode(output))
  } catch {
    return resultErrorCreate(op, "flow_state_unavailable")
  }
}
