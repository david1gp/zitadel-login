import * as v from "valibot"

const originSchema = v.pipe(
  v.string(),
  v.url(),
  v.check((value) => {
    const url = new URL(value)
    return url.origin === value && (url.protocol === "https:" || url.hostname === "localhost")
  }, "Expected an HTTPS origin without a path"),
)

export type WorkerRateLimiter = {
  limit: (options: { key: string }) => Promise<{ success: boolean }>
}

const rateLimiterSchema = v.custom<WorkerRateLimiter>((value) => {
  if (typeof value !== "object" || value === null) return false
  if (!("limit" in value)) return false
  return typeof value.limit === "function"
}, "Expected a Cloudflare Rate Limit binding")

export const workerBindingsSchema = v.strictObject({
  ZITADEL_ORIGIN: originSchema,
  ZITADEL_ORGANIZATION_ID: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  ZITADEL_ALLOWED_CLIENT_IDS: v.pipe(
    v.string(),
    v.transform((value) =>
      value
        .split(",")
        .map((clientId) => clientId.trim())
        .filter(Boolean),
    ),
    v.minLength(1),
    v.check((clientIds) => clientIds.every((clientId) => clientId.length <= 200), "Invalid client ID list"),
  ),
  LOGIN_V2_FALLBACK_URL: v.pipe(v.string(), v.url()),
  PAGES_ORIGIN: originSchema,
  SESSION_LIFETIME_SECONDS: v.pipe(
    v.string(),
    v.regex(/^\d+$/),
    v.transform(Number),
    v.integer(),
    v.minValue(60),
    v.maxValue(1800),
  ),
  ZITADEL_LOGIN_CLIENT_PAT: v.pipe(v.string(), v.minLength(20), v.maxLength(4096)),
  FLOW_COOKIE_KEY: v.pipe(
    v.string(),
    v.regex(/^[A-Za-z0-9_-]{43}$/, "Expected an unpadded base64url-encoded 32-byte key"),
  ),
  RATE_LIMITER: rateLimiterSchema,
})

export type WorkerBindings = v.InferOutput<typeof workerBindingsSchema>
export type WorkerBindingsInput = v.InferInput<typeof workerBindingsSchema>
