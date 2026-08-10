import * as v from "valibot"

import type { WorkerBindings } from "../config/workerBindingsSchema"
import { resultCreate } from "../result/resultCreate"
import { resultErrorCreate } from "../result/resultErrorCreate"

const promptSchema = v.picklist([
  "PROMPT_UNSPECIFIED",
  "PROMPT_NONE",
  "PROMPT_LOGIN",
  "PROMPT_CONSENT",
  "PROMPT_SELECT_ACCOUNT",
  "PROMPT_CREATE",
])

const authRequestSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  clientId: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  redirectUri: v.pipe(v.string(), v.minLength(1), v.maxLength(2048)),
  scope: v.array(v.string()),
  prompt: v.array(promptSchema),
  uiLocales: v.array(v.string()),
  loginHint: v.optional(v.string()),
  hintUserId: v.optional(v.string()),
})

const authRequestResponseSchema = v.object({ authRequest: authRequestSchema })

const userSchema = v.object({
  userId: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  state: v.string(),
  details: v.optional(v.object({ resourceOwner: v.optional(v.string()) })),
  human: v.optional(
    v.object({
      email: v.optional(
        v.object({
          email: v.pipe(v.string(), v.email()),
          isVerified: v.boolean(),
        }),
      ),
    }),
  ),
})

const usersResponseSchema = v.object({ result: v.array(userSchema) })
const authenticationMethodsResponseSchema = v.object({ authMethodTypes: v.array(v.string()) })
const sessionCreateResponseSchema = v.object({
  sessionId: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  sessionToken: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
})
const sessionSetResponseSchema = v.object({
  sessionToken: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
})
const callbackResponseSchema = v.object({ callbackUrl: v.pipe(v.string(), v.minLength(1), v.maxLength(4096)) })

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export function zitadelClientCreate(bindings: WorkerBindings, fetchImplementation: Fetch) {
  async function request<T>(op: string, path: string, schema: v.GenericSchema<unknown, T>, init?: RequestInit) {
    let response: Response
    try {
      response = await fetchImplementation(`${bindings.ZITADEL_ORIGIN}${path}`, {
        ...init,
        headers: {
          authorization: `Bearer ${bindings.ZITADEL_LOGIN_CLIENT_PAT}`,
          accept: "application/json",
          ...(init?.body ? { "content-type": "application/json" } : {}),
        },
      })
    } catch {
      return resultErrorCreate(op, "ZITADEL request failed")
    }

    if (!response.ok) {
      return resultErrorCreate(op, "ZITADEL rejected the request", { status: response.status })
    }

    let input: unknown
    try {
      input = await response.json()
    } catch {
      return resultErrorCreate(op, "ZITADEL returned invalid JSON", { status: response.status })
    }

    const parsed = v.safeParse(schema, input)
    if (!parsed.success) {
      return resultErrorCreate(op, "ZITADEL returned an invalid payload", { status: response.status })
    }
    return resultCreate(parsed.output)
  }

  return {
    authRequestGet(authRequestId: string) {
      return request(
        "authRequestGet",
        `/v2/oidc/auth_requests/${encodeURIComponent(authRequestId)}`,
        authRequestResponseSchema,
      )
    },
    usersByEmailList(email: string) {
      return request("usersByEmailList", "/v2/users", usersResponseSchema, {
        method: "POST",
        body: JSON.stringify({
          query: { limit: 2 },
          queries: [
            { emailQuery: { emailAddress: email, method: "TEXT_QUERY_METHOD_EQUALS_IGNORE_CASE" } },
            { organizationIdQuery: { organizationId: bindings.ZITADEL_ORGANIZATION_ID } },
          ],
        }),
      })
    },
    authenticationMethodsGet(userId: string) {
      return request(
        "authenticationMethodsGet",
        `/v2/users/${encodeURIComponent(userId)}/authentication_methods`,
        authenticationMethodsResponseSchema,
      )
    },
    sessionCreate(userId: string) {
      return request("sessionCreate", "/v2/sessions", sessionCreateResponseSchema, {
        method: "POST",
        body: JSON.stringify({
          checks: { user: { userId } },
          lifetime: `${bindings.SESSION_LIFETIME_SECONDS}s`,
        }),
      })
    },
    sessionChallenge(sessionId: string) {
      return request("sessionChallenge", `/v2/sessions/${encodeURIComponent(sessionId)}`, sessionSetResponseSchema, {
        method: "PATCH",
        body: JSON.stringify({ challenges: { otpEmail: { sendCode: {} } } }),
      })
    },
    sessionVerify(sessionId: string, code: string) {
      return request("sessionVerify", `/v2/sessions/${encodeURIComponent(sessionId)}`, sessionSetResponseSchema, {
        method: "PATCH",
        body: JSON.stringify({ checks: { otpEmail: { code } } }),
      })
    },
    callbackSessionCreate(authRequestId: string, sessionId: string, sessionToken: string) {
      return request(
        "callbackSessionCreate",
        `/v2/oidc/auth_requests/${encodeURIComponent(authRequestId)}`,
        callbackResponseSchema,
        {
          method: "POST",
          body: JSON.stringify({ session: { sessionId, sessionToken } }),
        },
      )
    },
    callbackErrorCreate(authRequestId: string, error: "ERROR_REASON_LOGIN_REQUIRED") {
      return request(
        "callbackErrorCreate",
        `/v2/oidc/auth_requests/${encodeURIComponent(authRequestId)}`,
        callbackResponseSchema,
        { method: "POST", body: JSON.stringify({ error: { error } }) },
      )
    },
  }
}
