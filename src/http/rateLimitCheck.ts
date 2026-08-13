import type { WorkerRateLimiter } from "../config/workerBindingsSchema"
import type { Result } from "../result/Result"
import { resultCreate } from "../result/resultCreate"
import { resultErrorCreate } from "../result/resultErrorCreate"

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

async function rateLimitKeyCreate(
  scope: string,
  value: string,
  keyValue: string,
  options: { errorMessage: string; operation: string },
): Promise<Result<string>> {
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      bytesCopy(base64UrlDecode(keyValue)),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    )
    const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${scope}\u0000${value}`))
    return resultCreate(`${scope}:${base64UrlEncode(new Uint8Array(signed))}`)
  } catch {
    return resultErrorCreate(options.operation, options.errorMessage)
  }
}

export async function rateLimitCheck(
  rateLimiter: WorkerRateLimiter,
  cookieKey: string,
  scope: string,
  values: Array<[string, string]>,
  options: {
    errorMessage: string
    keyOperation: string
    operation: string
  },
): Promise<Result<void>> {
  for (const [name, value] of values) {
    const key = await rateLimitKeyCreate(`${scope}:${name}`, value, cookieKey, {
      errorMessage: options.errorMessage,
      operation: options.keyOperation,
    })
    if (!key.success) return key

    try {
      const outcome = await rateLimiter.limit({ key: key.data })
      if (!outcome.success) return resultErrorCreate(options.operation, "rate_limited")
    } catch {
      return resultErrorCreate(options.operation, "rate_limiter_unavailable")
    }
  }
  return resultCreate(undefined)
}
