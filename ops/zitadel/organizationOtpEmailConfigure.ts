import * as v from "valibot"

import type { Result } from "../../src/result/Result"
import { resultCreate } from "../../src/result/resultCreate"
import { resultErrorCreate } from "../../src/result/resultErrorCreate"

const organizationOtpEmailConfigSchema = v.object({
  ZITADEL_ADMIN_PAT: v.pipe(v.string(), v.minLength(20), v.maxLength(4096)),
  ZITADEL_ORGANIZATION_ID: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  ZITADEL_ORGANIZATION_NAME: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  ZITADEL_ORIGIN: v.pipe(
    v.string(),
    v.url(),
    v.check((value) => {
      const url = new URL(value)
      return url.protocol === "https:" && url.pathname === "/" && !url.search && !url.hash
    }, "ZITADEL_ORIGIN must be an HTTPS origin without a path"),
  ),
  ZITADEL_OTP_CONFIRM_EMAIL: v.pipe(v.string(), v.email(), v.maxLength(200)),
  ZITADEL_OTP_MODE: v.optional(v.picklist(["dry-run", "apply"]), "dry-run"),
})

const organizationSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  state: v.literal("ORGANIZATION_STATE_ACTIVE"),
})
const organizationsResponseSchema = v.object({ result: v.array(organizationSchema) })

const smtpResponseSchema = v.object({
  config: v.object({
    state: v.literal("EMAIL_PROVIDER_ACTIVE"),
    smtp: v.object({ senderAddress: v.pipe(v.string(), v.email()) }),
  }),
})

const messageTextArtifactSchema = v.object({
  language: v.picklist(["en", "de"]),
  title: v.pipe(v.string(), v.minLength(1), v.maxBytes(2000)),
  preHeader: v.pipe(v.string(), v.minLength(1), v.maxBytes(2000)),
  subject: v.pipe(v.string(), v.minLength(1), v.maxBytes(2000), v.includes("{{.OTP}}")),
  greeting: v.pipe(v.string(), v.minLength(1), v.maxBytes(4000)),
  text: v.pipe(v.string(), v.minLength(1), v.maxBytes(40000), v.includes("{{.OTP}}")),
  buttonText: v.pipe(v.string(), v.minLength(1), v.maxBytes(4000)),
  footerText: v.pipe(v.string(), v.minLength(1), v.maxBytes(8000)),
})
const messageTextSchema = v.object({
  title: v.optional(v.string(), ""),
  preHeader: v.optional(v.string(), ""),
  subject: v.optional(v.string(), ""),
  greeting: v.optional(v.string(), ""),
  text: v.optional(v.string(), ""),
  buttonText: v.optional(v.string(), ""),
  footerText: v.optional(v.string(), ""),
  isDefault: v.optional(v.boolean(), false),
})
const messageTextResponseSchema = v.object({ customText: messageTextSchema })

const userSchema = v.object({
  userId: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  state: v.literal("USER_STATE_ACTIVE"),
  details: v.object({ resourceOwner: v.pipe(v.string(), v.minLength(1), v.maxLength(200)) }),
  human: v.object({
    email: v.optional(
      v.object({
        email: v.pipe(v.string(), v.email(), v.maxLength(200)),
        isVerified: v.boolean(),
      }),
    ),
  }),
})
const usersResponseSchema = v.object({ result: v.array(userSchema) })
const authenticationMethodsResponseSchema = v.object({ authMethodTypes: v.array(v.string()) })
const emptyResponseSchema = v.object({})

type OrganizationOtpEmailConfig = v.InferOutput<typeof organizationOtpEmailConfigSchema>
type MessageTextArtifact = v.InferOutput<typeof messageTextArtifactSchema>
type MessageText = v.InferOutput<typeof messageTextSchema>
type User = v.InferOutput<typeof userSchema>

type SafeFailureData = { status?: number; completed?: number }

type Summary = {
  operation: "organization-otp-email-configure"
  mode: "dry-run" | "apply"
  organization: { exactMatch: true; active: true }
  smtp: { active: true; sender: "preferred" | "fallback" }
  messageTexts: { total: number; unchanged: number; wouldApply: number; applied: number }
  users: {
    pages: number
    activeHuman: number
    verifiedEmailEligible: number
    unverifiedOrMissingEmail: number
    alreadyEnrolled: number
    wouldEnroll: number
    enrolled: number
  }
  exactEmailConfirmation: { matches: 1; eligible: true; enrolled: boolean }
}

const pageSize = 100
const otpEmailMethod = "AUTHENTICATION_METHOD_TYPE_OTP_EMAIL"

function configurationParse(input: NodeJS.ProcessEnv): Result<OrganizationOtpEmailConfig> {
  const op = "configurationParse"
  const parsed = v.safeParse(organizationOtpEmailConfigSchema, input)
  if (!parsed.success) {
    const fields = [
      ...new Set(parsed.issues.flatMap((issue) => issue.path?.map((item) => String(item.key)) ?? []).filter(Boolean)),
    ]
    return resultErrorCreate(op, "Invalid or missing environment configuration", { fields })
  }
  return resultCreate(parsed.output)
}

async function apiRequest<T>(
  config: OrganizationOtpEmailConfig,
  op: string,
  path: string,
  schema: v.GenericSchema<unknown, T>,
  init?: RequestInit,
): Promise<Result<T>> {
  let response: Response
  try {
    response = await fetch(`${config.ZITADEL_ORIGIN}${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${config.ZITADEL_ADMIN_PAT}`,
        "x-zitadel-orgid": config.ZITADEL_ORGANIZATION_ID,
        ...(init?.body ? { "content-type": "application/json" } : {}),
      },
    })
  } catch {
    return resultErrorCreate(op, "ZITADEL request failed")
  }

  if (!response.ok) {
    return resultErrorCreate(op, "ZITADEL rejected the request", { status: response.status } satisfies SafeFailureData)
  }

  let input: unknown
  try {
    input = await response.json()
  } catch {
    return resultErrorCreate(op, "ZITADEL returned invalid JSON", { status: response.status } satisfies SafeFailureData)
  }

  const parsed = v.safeParse(schema, input)
  if (!parsed.success) {
    return resultErrorCreate(op, "ZITADEL returned an invalid payload", {
      status: response.status,
    } satisfies SafeFailureData)
  }
  return resultCreate(parsed.output)
}

async function organizationValidate(config: OrganizationOtpEmailConfig): Promise<Result<true>> {
  const op = "organizationValidate"
  const response = await apiRequest(config, op, "/v2/organizations/_search", organizationsResponseSchema, {
    method: "POST",
    body: JSON.stringify({
      query: { limit: 2 },
      queries: [
        { idQuery: { id: config.ZITADEL_ORGANIZATION_ID } },
        {
          nameQuery: {
            name: config.ZITADEL_ORGANIZATION_NAME,
            method: "TEXT_QUERY_METHOD_EQUALS",
          },
        },
        { stateQuery: { state: "ORGANIZATION_STATE_ACTIVE" } },
      ],
    }),
  })
  if (!response.success) return response
  if (response.data.result.length !== 1) {
    return resultErrorCreate(op, "Organization ID and name did not resolve to exactly one active organization")
  }

  const organization = response.data.result[0]
  if (organization?.id !== config.ZITADEL_ORGANIZATION_ID || organization.name !== config.ZITADEL_ORGANIZATION_NAME) {
    return resultErrorCreate(op, "Resolved organization did not exactly match configuration")
  }
  return resultCreate(true)
}

async function smtpValidate(config: OrganizationOtpEmailConfig): Promise<Result<"preferred" | "fallback">> {
  const op = "smtpValidate"
  const response = await apiRequest(config, op, "/admin/v1/email", smtpResponseSchema)
  if (!response.success) return response

  const sender = response.data.config.smtp.senderAddress.toLowerCase()
  if (sender === "auth@contentoren.de") return resultCreate("preferred")
  if (sender === "it@contentoren.de") return resultCreate("fallback")
  return resultErrorCreate(op, "Active SMTP sender is neither the preferred nor accepted fallback address")
}

async function messageTextArtifactsRead(): Promise<Result<MessageTextArtifact[]>> {
  const op = "messageTextArtifactsRead"
  const artifacts: MessageTextArtifact[] = []
  for (const language of ["en", "de"] as const) {
    let input: unknown
    try {
      input = await Bun.file(new URL(`./message-texts/VerifyEmailOTP.v1.${language}.json`, import.meta.url)).json()
    } catch {
      return resultErrorCreate(op, "Could not read a committed message-text artifact")
    }

    const parsed = v.safeParse(messageTextArtifactSchema, input)
    if (!parsed.success || parsed.output.language !== language) {
      return resultErrorCreate(op, "A committed message-text artifact is invalid")
    }
    artifacts.push(parsed.output)
  }
  return resultCreate(artifacts)
}

function messageTextMatches(current: MessageText, desired: MessageTextArtifact): boolean {
  return (
    !current.isDefault &&
    current.title === desired.title &&
    current.preHeader === desired.preHeader &&
    current.subject === desired.subject &&
    current.greeting === desired.greeting &&
    current.text === desired.text &&
    current.buttonText === desired.buttonText &&
    current.footerText === desired.footerText
  )
}

async function messageTextsConfigure(
  config: OrganizationOtpEmailConfig,
  artifacts: MessageTextArtifact[],
): Promise<Result<Summary["messageTexts"]>> {
  const op = "messageTextsConfigure"
  const counts = { total: artifacts.length, unchanged: 0, wouldApply: 0, applied: 0 }

  for (const artifact of artifacts) {
    const path = `/management/v1/text/message/verifyemailotp/${artifact.language}`
    const current = await apiRequest(config, op, path, messageTextResponseSchema)
    if (!current.success) return current
    if (messageTextMatches(current.data.customText, artifact)) {
      counts.unchanged += 1
      continue
    }

    counts.wouldApply += 1
    if (config.ZITADEL_OTP_MODE === "dry-run") continue

    const applied = await apiRequest(config, op, path, emptyResponseSchema, {
      method: "PUT",
      body: JSON.stringify({
        title: artifact.title,
        preHeader: artifact.preHeader,
        subject: artifact.subject,
        greeting: artifact.greeting,
        text: artifact.text,
        buttonText: artifact.buttonText,
        footerText: artifact.footerText,
      }),
    })
    if (!applied.success) return applied

    const verified = await apiRequest(config, op, path, messageTextResponseSchema)
    if (!verified.success) return verified
    if (!messageTextMatches(verified.data.customText, artifact)) {
      return resultErrorCreate(op, "Message-text write did not verify")
    }
    counts.applied += 1
  }
  return resultCreate(counts)
}

async function activeHumanUsersList(
  config: OrganizationOtpEmailConfig,
): Promise<Result<{ users: User[]; pages: number }>> {
  const op = "activeHumanUsersList"
  const users: User[] = []
  const userIds = new Set<string>()
  let pages = 0

  while (true) {
    const response = await apiRequest(config, op, "/v2/users", usersResponseSchema, {
      method: "POST",
      body: JSON.stringify({
        query: { offset: users.length, limit: pageSize, asc: true },
        sortingColumn: "USER_FIELD_NAME_CREATION_DATE",
        queries: [
          { organizationIdQuery: { organizationId: config.ZITADEL_ORGANIZATION_ID } },
          { stateQuery: { state: "USER_STATE_ACTIVE" } },
          { typeQuery: { type: "TYPE_HUMAN" } },
        ],
      }),
    })
    if (!response.success) return response
    pages += 1

    for (const user of response.data.result) {
      if (user.details.resourceOwner !== config.ZITADEL_ORGANIZATION_ID) {
        return resultErrorCreate(op, "ZITADEL returned a user outside the configured organization")
      }
      if (userIds.has(user.userId)) {
        return resultErrorCreate(op, "ZITADEL returned a duplicate user across pages")
      }
      userIds.add(user.userId)
      users.push(user)
    }

    if (response.data.result.length < pageSize) return resultCreate({ users, pages })
  }
}

async function authenticationMethodsGet(config: OrganizationOtpEmailConfig, userId: string): Promise<Result<string[]>> {
  const op = "authenticationMethodsGet"
  const response = await apiRequest(
    config,
    op,
    `/v2/users/${encodeURIComponent(userId)}/authentication_methods`,
    authenticationMethodsResponseSchema,
  )
  if (!response.success) return response
  return resultCreate(response.data.authMethodTypes)
}

async function eligibleUsersConfigure(
  config: OrganizationOtpEmailConfig,
  users: User[],
  pages: number,
): Promise<Result<{ users: Summary["users"]; exactEmailConfirmation: Summary["exactEmailConfirmation"] }>> {
  const op = "eligibleUsersConfigure"
  const eligibleUsers = users.filter((user) => user.human.email?.isVerified === true)
  const confirmationMatches = eligibleUsers.filter(
    (user) => user.human.email?.email.toLowerCase() === config.ZITADEL_OTP_CONFIRM_EMAIL.toLowerCase(),
  )
  if (confirmationMatches.length !== 1) {
    return resultErrorCreate(op, "Confirmation email did not match exactly one eligible user")
  }

  const counts: Summary["users"] = {
    pages,
    activeHuman: users.length,
    verifiedEmailEligible: eligibleUsers.length,
    unverifiedOrMissingEmail: users.length - eligibleUsers.length,
    alreadyEnrolled: 0,
    wouldEnroll: 0,
    enrolled: 0,
  }
  let confirmationEnrolled = false

  for (const user of eligibleUsers) {
    const methods = await authenticationMethodsGet(config, user.userId)
    if (!methods.success) {
      return resultErrorCreate(op, methods.errorMessage, { completed: counts.alreadyEnrolled + counts.enrolled })
    }

    const isConfirmation = user.userId === confirmationMatches[0]?.userId
    if (methods.data.includes(otpEmailMethod)) {
      counts.alreadyEnrolled += 1
      if (isConfirmation) confirmationEnrolled = true
      continue
    }

    counts.wouldEnroll += 1
    if (config.ZITADEL_OTP_MODE === "dry-run") continue

    const added = await apiRequest(
      config,
      op,
      `/v2/users/${encodeURIComponent(user.userId)}/otp_email`,
      emptyResponseSchema,
      { method: "POST", body: "{}" },
    )
    if (!added.success) {
      return resultErrorCreate(op, added.errorMessage, { completed: counts.alreadyEnrolled + counts.enrolled })
    }

    const verified = await authenticationMethodsGet(config, user.userId)
    if (!verified.success || !verified.data.includes(otpEmailMethod)) {
      return resultErrorCreate(op, "OTP Email enrollment did not verify", {
        completed: counts.alreadyEnrolled + counts.enrolled,
      })
    }
    counts.enrolled += 1
    if (isConfirmation) confirmationEnrolled = true
  }

  return resultCreate({
    users: counts,
    exactEmailConfirmation: { matches: 1, eligible: true, enrolled: confirmationEnrolled },
  })
}

async function organizationOtpEmailConfigure(): Promise<Result<Summary>> {
  const config = configurationParse(process.env)
  if (!config.success) return config

  const organization = await organizationValidate(config.data)
  if (!organization.success) return organization

  const smtp = await smtpValidate(config.data)
  if (!smtp.success) return smtp

  const artifacts = await messageTextArtifactsRead()
  if (!artifacts.success) return artifacts

  const messageTexts = await messageTextsConfigure(config.data, artifacts.data)
  if (!messageTexts.success) return messageTexts

  const activeHumanUsers = await activeHumanUsersList(config.data)
  if (!activeHumanUsers.success) return activeHumanUsers

  const enrollment = await eligibleUsersConfigure(config.data, activeHumanUsers.data.users, activeHumanUsers.data.pages)
  if (!enrollment.success) return enrollment

  return resultCreate({
    operation: "organization-otp-email-configure",
    mode: config.data.ZITADEL_OTP_MODE,
    organization: { exactMatch: true, active: true },
    smtp: { active: true, sender: smtp.data },
    messageTexts: messageTexts.data,
    users: enrollment.data.users,
    exactEmailConfirmation: enrollment.data.exactEmailConfirmation,
  })
}

const result = await organizationOtpEmailConfigure()
const output = result.success
  ? { success: true, ...result.data }
  : {
      success: false,
      op: result.op,
      errorMessage: result.errorMessage,
      ...(result.rawData === undefined ? {} : { safeData: result.rawData }),
    }

console[result.success ? "log" : "error"](JSON.stringify(output, null, 2))
if (!result.success) process.exitCode = 1
