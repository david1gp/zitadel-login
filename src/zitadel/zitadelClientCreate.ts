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
  prompt: v.optional(v.array(promptSchema), []),
  uiLocales: v.optional(v.array(v.string()), []),
  loginHint: v.optional(v.string()),
  maxAge: v.optional(
    v.pipe(
      v.string(),
      v.regex(/^\d+(?:\.\d{1,9})?s$/),
      v.transform((value) => Math.floor(Number(value.slice(0, -1)))),
      v.integer(),
      v.minValue(0),
      v.maxValue(2_147_483_647),
    ),
  ),
  hintUserId: v.optional(v.string()),
})

const authRequestResponseSchema = v.object({ authRequest: authRequestSchema })

const userSchema = v.object({
  userId: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  state: v.string(),
  preferredLoginName: v.optional(v.string()),
  details: v.optional(v.object({ resourceOwner: v.optional(v.string()) })),
  human: v.optional(
    v.object({
      profile: v.optional(
        v.object({
          displayName: v.optional(v.string()),
          avatarUrl: v.optional(v.string()),
        }),
      ),
      email: v.optional(
        v.object({
          email: v.pipe(v.string(), v.email()),
          isVerified: v.boolean(),
        }),
      ),
      phone: v.optional(v.object({ phone: v.string(), isVerified: v.optional(v.boolean()) })),
      passwordChangeRequired: v.optional(v.boolean()),
      passwordChanged: v.optional(v.string()),
    }),
  ),
})

const userResponseSchema = v.object({ user: userSchema })
const usersResponseSchema = v.object({ result: v.array(userSchema) })
const authenticationMethodsResponseSchema = v.object({ authMethodTypes: v.array(v.string()) })
const sessionCreateResponseSchema = v.object({
  sessionId: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  sessionToken: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
})
const passkeySessionCreateResponseSchema = v.object({
  sessionId: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  sessionToken: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
  challenges: v.optional(
    v.object({
      webAuthN: v.optional(
        v.object({
          publicKeyCredentialRequestOptions: v.unknown(),
        }),
      ),
    }),
  ),
})
const passkeySessionChallengeResponseSchema = v.object({
  sessionToken: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
  challenges: v.optional(
    v.object({
      webAuthN: v.optional(
        v.object({
          publicKeyCredentialRequestOptions: v.unknown(),
        }),
      ),
    }),
  ),
})
const sessionSetResponseSchema = v.object({
  sessionToken: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
})
const humanMfaInitSkippedResponseSchema = v.object({ details: v.optional(v.unknown()) })
const callbackResponseSchema = v.object({ callbackUrl: v.pipe(v.string(), v.minLength(1), v.maxLength(4096)) })
const organizationSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  primaryDomain: v.optional(v.string()),
  state: v.optional(v.string()),
})
const organizationsResponseSchema = v.object({ result: v.array(organizationSchema) })
const themeSchema = v.object({
  backgroundColor: v.optional(v.string()),
  fontColor: v.optional(v.string()),
  iconUrl: v.optional(v.string()),
  logoUrl: v.optional(v.string()),
  primaryColor: v.optional(v.string()),
  warnColor: v.optional(v.string()),
})
const brandingSettingsSchema = v.object({
  darkTheme: v.optional(themeSchema),
  disableWatermark: v.optional(v.boolean()),
  fontUrl: v.optional(v.string()),
  lightTheme: v.optional(themeSchema),
  themeMode: v.optional(v.string()),
})
const brandingSettingsResponseSchema = v.object({ settings: v.optional(brandingSettingsSchema) })
const loginSettingsSchema = v.object({
  allowExternalIdp: v.optional(v.boolean()),
  allowLocalAuthentication: v.optional(v.boolean()),
  forceMfa: v.optional(v.boolean()),
  forceMfaLocalOnly: v.optional(v.boolean()),
  ignoreUnknownUsernames: v.optional(v.boolean()),
  passkeysType: v.optional(v.string()),
  secondFactors: v.optional(v.array(v.string()), []),
  multiFactors: v.optional(v.array(v.string()), []),
})
const loginSettingsResponseSchema = v.object({ settings: v.optional(loginSettingsSchema) })
const passwordExpirySettingsResponseSchema = v.object({
  settings: v.optional(
    v.object({
      maxAgeDays: v.optional(
        v.pipe(
          v.union([v.pipe(v.string(), v.regex(/^\d+$/), v.transform(Number)), v.number()]),
          v.integer(),
          v.minValue(0),
          v.maxValue(365_000),
        ),
      ),
    }),
  ),
})
const identityProviderSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  options: v.optional(
    v.object({
      isCreationAllowed: v.optional(v.boolean()),
      isLinkingAllowed: v.optional(v.boolean()),
    }),
  ),
  type: v.pipe(
    v.string(),
    v.check(
      (value) =>
        [
          "IDENTITY_PROVIDER_TYPE_APPLE",
          "IDENTITY_PROVIDER_TYPE_AZURE_AD",
          "IDENTITY_PROVIDER_TYPE_GITHUB",
          "IDENTITY_PROVIDER_TYPE_GITHUB_ES",
          "IDENTITY_PROVIDER_TYPE_GITLAB",
          "IDENTITY_PROVIDER_TYPE_GITLAB_SELF_HOSTED",
          "IDENTITY_PROVIDER_TYPE_GOOGLE",
          "IDENTITY_PROVIDER_TYPE_JWT",
          "IDENTITY_PROVIDER_TYPE_LDAP",
          "IDENTITY_PROVIDER_TYPE_OAUTH",
          "IDENTITY_PROVIDER_TYPE_OIDC",
          "IDENTITY_PROVIDER_TYPE_SAML",
        ].includes(value),
      "Unknown identity provider type",
    ),
  ),
})
const identityProvidersResponseSchema = v.object({ identityProviders: v.optional(v.array(identityProviderSchema), []) })
const identityProviderIntentResponseSchema = v.object({
  authUrl: v.optional(v.string()),
  idpIntent: v.optional(
    v.object({
      id: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
      token: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
    }),
  ),
  formData: v.optional(
    v.object({
      url: v.pipe(v.string(), v.minLength(1), v.maxLength(2048)),
      fields: v.optional(v.record(v.string(), v.string())),
    }),
  ),
})
const idpInformationSchema = v.object({
  idpId: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  userId: v.optional(v.string()),
  userName: v.optional(v.string()),
})
const retrieveIdentityProviderIntentResponseSchema = v.object({
  idpInformation: v.optional(idpInformationSchema),
  userId: v.optional(v.string()),
})
const sessionResponseSchema = v.object({
  session: v.object({
    id: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
    sessionToken: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(500))),
    expirationDate: v.optional(v.pipe(v.string(), v.isoTimestamp())),
    factors: v.optional(
      v.looseObject({
        user: v.optional(
          v.object({
            id: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
            loginName: v.optional(v.string()),
            organizationId: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
          }),
        ),
        password: v.optional(v.object({ verifiedAt: v.optional(v.pipe(v.string(), v.isoTimestamp())) })),
        intent: v.optional(v.object({ verifiedAt: v.optional(v.pipe(v.string(), v.isoTimestamp())) })),
        totp: v.optional(v.object({ verifiedAt: v.optional(v.pipe(v.string(), v.isoTimestamp())) })),
        otpSms: v.optional(v.object({ verifiedAt: v.optional(v.pipe(v.string(), v.isoTimestamp())) })),
        otpEmail: v.optional(v.object({ verifiedAt: v.optional(v.pipe(v.string(), v.isoTimestamp())) })),
        webAuthN: v.optional(
          v.object({
            verifiedAt: v.optional(v.pipe(v.string(), v.isoTimestamp())),
            userVerified: v.optional(v.boolean()),
          }),
        ),
      }),
    ),
  }),
})

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

function errorIdGet(value: unknown, depth = 0): string | undefined {
  if (depth > 3 || typeof value !== "object" || value === null) return undefined
  if ("id" in value && typeof value.id === "string") return value.id
  for (const child of Object.values(value)) {
    const id = errorIdGet(child, depth + 1)
    if (id) return id
  }
  return undefined
}

export function zitadelClientCreate(bindings: WorkerBindings, fetchImplementation: Fetch) {
  async function request<T>(op: string, path: string, schema: v.GenericSchema<unknown, T>, init?: RequestInit) {
    let response: Response
    const headers = Object.fromEntries(new Headers(init?.headers).entries())
    try {
      response = await fetchImplementation(`${bindings.ZITADEL_ORIGIN}${path}`, {
        ...init,
        headers: {
          ...headers,
          authorization: `Bearer ${bindings.ZITADEL_LOGIN_CLIENT_PAT}`,
          accept: "application/json",
          ...(init?.body ? { "content-type": "application/json" } : {}),
        },
      })
    } catch {
      return resultErrorCreate(op, "ZITADEL request failed")
    }

    if (!response.ok) {
      let body: unknown
      try {
        body = await response.json()
      } catch {
        body = undefined
      }
      const id = errorIdGet(body)
      const details = { status: response.status, ...(id ? { id } : {}) }
      return resultErrorCreate(op, "ZITADEL rejected the request", details)
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
    activeIdentityProvidersGet(organizationId: string) {
      return request("activeIdentityProvidersGet", "/v2/settings/login/idps", identityProvidersResponseSchema, {
        headers: { "x-zitadel-orgid": organizationId },
      })
    },
    identityProviderIntentStart(idpId: string, successUrl: string, failureUrl: string) {
      return request("identityProviderIntentStart", "/v2/idp_intents", identityProviderIntentResponseSchema, {
        method: "POST",
        body: JSON.stringify({
          idpId,
          urls: {
            successUrl,
            failureUrl,
          },
        }),
      })
    },
    identityProviderIntentRetrieve(id: string, token: string) {
      return request(
        "identityProviderIntentRetrieve",
        `/v2/idp_intents/${encodeURIComponent(id)}`,
        retrieveIdentityProviderIntentResponseSchema,
        {
          method: "POST",
          body: JSON.stringify({ idpIntentToken: token }),
        },
      )
    },
    idpIntentSessionCreate(userId: string, idpIntentId: string, idpIntentToken: string) {
      return request("idpIntentSessionCreate", "/v2/sessions", sessionCreateResponseSchema, {
        method: "POST",
        body: JSON.stringify({
          checks: {
            user: { userId },
            idpIntent: {
              idpIntentId,
              idpIntentToken,
            },
          },
          lifetime: `${bindings.SESSION_LIFETIME_SECONDS}s`,
        }),
      })
    },
    authRequestGet(authRequestId: string) {
      return request(
        "authRequestGet",
        `/v2/oidc/auth_requests/${encodeURIComponent(authRequestId)}`,
        authRequestResponseSchema,
      )
    },
    brandingSettingsGet(organizationId: string) {
      return request("brandingSettingsGet", "/v2/settings/branding", brandingSettingsResponseSchema, {
        headers: { "x-zitadel-orgid": organizationId },
      })
    },
    defaultOrganizationGet() {
      return request("defaultOrganizationGet", "/v2/organizations/_search", organizationsResponseSchema, {
        method: "POST",
        body: JSON.stringify({ queries: [{ query: { defaultQuery: {} } }] }),
      }).then((result) => {
        if (!result.success) return result
        const organization = result.data.result[0]
        if (!organization)
          return resultErrorCreate("defaultOrganizationGet", "ZITADEL returned no default organization")
        return resultCreate(organization)
      })
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
    usersByIdentifierList(identifier: string, organizationId: string) {
      const identifierQueries = [
        { loginNameQuery: { loginName: identifier, method: "TEXT_QUERY_METHOD_EQUALS_IGNORE_CASE" } },
        { emailQuery: { emailAddress: identifier, method: "TEXT_QUERY_METHOD_EQUALS_IGNORE_CASE" } },
        ...(identifier.length <= 20
          ? [{ phoneQuery: { number: identifier, method: "TEXT_QUERY_METHOD_EQUALS_IGNORE_CASE" } }]
          : []),
      ]
      return request("usersByIdentifierList", "/v2/users", usersResponseSchema, {
        method: "POST",
        body: JSON.stringify({
          query: { limit: 2 },
          queries: [
            {
              orQuery: {
                queries: identifierQueries,
              },
            },
            { organizationIdQuery: { organizationId } },
          ],
        }),
      })
    },
    userGet(userId: string) {
      return request("userGet", `/v2/users/${encodeURIComponent(userId)}`, userResponseSchema)
    },
    authenticationMethodsGet(userId: string) {
      return request(
        "authenticationMethodsGet",
        `/v2/users/${encodeURIComponent(userId)}/authentication_methods`,
        authenticationMethodsResponseSchema,
      )
    },
    humanMfaInitSkipped(userId: string) {
      return request(
        "humanMfaInitSkipped",
        `/v2/users/${encodeURIComponent(userId)}/mfa_init_skipped`,
        humanMfaInitSkippedResponseSchema,
        { method: "POST", body: JSON.stringify({}) },
      )
    },
    loginSettingsGet(organizationId: string) {
      return request("loginSettingsGet", "/v2/settings/login", loginSettingsResponseSchema, {
        headers: { "x-zitadel-orgid": organizationId },
      })
    },
    passwordExpirySettingsGet(organizationId: string) {
      return request(
        "passwordExpirySettingsGet",
        "/v2/settings/password/expiry",
        passwordExpirySettingsResponseSchema,
        {
          headers: { "x-zitadel-orgid": organizationId },
        },
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
    emailOtpSessionCreate(userId: string) {
      return request("emailOtpSessionCreate", "/v2/sessions", sessionCreateResponseSchema, {
        method: "POST",
        body: JSON.stringify({
          checks: { user: { userId } },
          challenges: { otpEmail: { sendCode: {} } },
          lifetime: `${bindings.SESSION_LIFETIME_SECONDS}s`,
        }),
      })
    },
    passwordSessionCreate(userId: string, password: string) {
      return request("passwordSessionCreate", "/v2/sessions", sessionCreateResponseSchema, {
        method: "POST",
        body: JSON.stringify({
          checks: { user: { userId }, password: { password } },
          lifetime: `${bindings.SESSION_LIFETIME_SECONDS}s`,
        }),
      })
    },
    passkeySessionCreate(userId: string, domain: string) {
      return request("passkeySessionCreate", "/v2/sessions", passkeySessionCreateResponseSchema, {
        method: "POST",
        body: JSON.stringify({
          checks: { user: { userId } },
          challenges: {
            webAuthN: {
              domain,
              userVerificationRequirement: "USER_VERIFICATION_REQUIREMENT_REQUIRED",
            },
          },
          lifetime: `${bindings.SESSION_LIFETIME_SECONDS}s`,
        }),
      })
    },
    passkeySessionChallenge(sessionId: string, sessionToken: string, domain: string) {
      return request(
        "passkeySessionChallenge",
        `/v2/sessions/${encodeURIComponent(sessionId)}`,
        passkeySessionChallengeResponseSchema,
        {
          method: "PATCH",
          body: JSON.stringify({
            sessionToken,
            challenges: {
              webAuthN: {
                domain,
                userVerificationRequirement: "USER_VERIFICATION_REQUIREMENT_REQUIRED",
              },
            },
            lifetime: `${bindings.SESSION_LIFETIME_SECONDS}s`,
          }),
        },
      )
    },
    u2fSessionChallenge(
      sessionId: string,
      sessionToken: string,
      domain: string,
      userVerificationRequirement:
        | "USER_VERIFICATION_REQUIREMENT_DISCOURAGED"
        | "USER_VERIFICATION_REQUIREMENT_REQUIRED" = "USER_VERIFICATION_REQUIREMENT_DISCOURAGED",
    ) {
      return request(
        "u2fSessionChallenge",
        `/v2/sessions/${encodeURIComponent(sessionId)}`,
        passkeySessionChallengeResponseSchema,
        {
          method: "PATCH",
          body: JSON.stringify({
            sessionToken,
            challenges: {
              webAuthN: {
                domain,
                userVerificationRequirement,
              },
            },
            lifetime: `${bindings.SESSION_LIFETIME_SECONDS}s`,
          }),
        },
      )
    },
    passkeySessionVerify(sessionId: string, sessionToken: string, credentialAssertionData: unknown) {
      return request(
        "passkeySessionVerify",
        `/v2/sessions/${encodeURIComponent(sessionId)}`,
        sessionSetResponseSchema,
        {
          method: "PATCH",
          body: JSON.stringify({
            sessionToken,
            checks: { webAuthN: { credentialAssertionData } },
            lifetime: `${bindings.SESSION_LIFETIME_SECONDS}s`,
          }),
        },
      )
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
    emailOtpSessionChallenge(sessionId: string, sessionToken: string) {
      return request(
        "emailOtpSessionChallenge",
        `/v2/sessions/${encodeURIComponent(sessionId)}`,
        sessionSetResponseSchema,
        {
          method: "PATCH",
          body: JSON.stringify({
            sessionToken,
            challenges: { otpEmail: { sendCode: {} } },
            lifetime: `${bindings.SESSION_LIFETIME_SECONDS}s`,
          }),
        },
      )
    },
    smsOtpSessionChallenge(sessionId: string, sessionToken: string) {
      return request(
        "smsOtpSessionChallenge",
        `/v2/sessions/${encodeURIComponent(sessionId)}`,
        sessionSetResponseSchema,
        {
          method: "PATCH",
          body: JSON.stringify({
            sessionToken,
            challenges: { otpSms: {} },
            lifetime: `${bindings.SESSION_LIFETIME_SECONDS}s`,
          }),
        },
      )
    },
    smsOtpSessionVerify(sessionId: string, sessionToken: string, code: string) {
      return request("smsOtpSessionVerify", `/v2/sessions/${encodeURIComponent(sessionId)}`, sessionSetResponseSchema, {
        method: "PATCH",
        body: JSON.stringify({
          sessionToken,
          checks: { otpSms: { code } },
          lifetime: `${bindings.SESSION_LIFETIME_SECONDS}s`,
        }),
      })
    },
    emailOtpSessionVerify(sessionId: string, sessionToken: string, code: string) {
      return request(
        "emailOtpSessionVerify",
        `/v2/sessions/${encodeURIComponent(sessionId)}`,
        sessionSetResponseSchema,
        {
          method: "PATCH",
          body: JSON.stringify({
            sessionToken,
            checks: { otpEmail: { code } },
            lifetime: `${bindings.SESSION_LIFETIME_SECONDS}s`,
          }),
        },
      )
    },
    totpSessionVerify(sessionId: string, sessionToken: string, code: string) {
      return request("totpSessionVerify", `/v2/sessions/${encodeURIComponent(sessionId)}`, sessionSetResponseSchema, {
        method: "PATCH",
        body: JSON.stringify({
          sessionToken,
          checks: { totp: { code } },
          lifetime: `${bindings.SESSION_LIFETIME_SECONDS}s`,
        }),
      })
    },
    sessionGet(sessionId: string, sessionToken: string) {
      const query = new URLSearchParams({ sessionToken })
      return request(
        "sessionGet",
        `/v2/sessions/${encodeURIComponent(sessionId)}?${query.toString()}`,
        sessionResponseSchema,
      )
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
