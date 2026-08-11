import * as v from "valibot"

import type { Result } from "../../src/result/Result"
import { resultCreate } from "../../src/result/resultCreate"
import { resultErrorCreate } from "../../src/result/resultErrorCreate"

const configurationSchema = v.object({
  ZITADEL_ADMIN_PAT: v.pipe(v.string(), v.minLength(20), v.maxLength(4096)),
  ZITADEL_E2E_MODE: v.optional(v.picklist(["dry-run", "apply"]), "dry-run"),
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
})

const objectDetailsSchema = v.object({ resourceOwner: v.pipe(v.string(), v.minLength(1), v.maxLength(200)) })
const organizationSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  state: v.literal("ORGANIZATION_STATE_ACTIVE"),
})
const organizationsResponseSchema = v.object({ result: v.array(organizationSchema) })
const instanceFeaturesSchema = v.object({
  loginV2: v.object({
    required: v.optional(v.boolean(), false),
    baseUri: v.optional(v.string()),
    source: v.string(),
  }),
})
const emptyResponseSchema = v.object({})
const projectSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  details: objectDetailsSchema,
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  state: v.literal("PROJECT_STATE_ACTIVE"),
  projectRoleAssertion: v.optional(v.boolean(), false),
  projectRoleCheck: v.optional(v.boolean(), false),
  hasProjectCheck: v.boolean(),
  privateLabelingSetting: v.optional(v.string(), "PRIVATE_LABELING_SETTING_UNSPECIFIED"),
})
const projectsResponseSchema = v.object({ result: v.optional(v.array(projectSchema), []) })
const projectCreateResponseSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  details: objectDetailsSchema,
})
const loginVersionSchema = v.object({
  loginV2: v.object({ baseUri: v.literal("https://login.contentoren.de") }),
})
const oidcConfigurationSchema = v.object({
  redirectUris: v.array(v.string()),
  responseTypes: v.array(v.string()),
  grantTypes: v.array(v.string()),
  appType: v.string(),
  clientId: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  authMethodType: v.string(),
  postLogoutRedirectUris: v.optional(v.array(v.string()), []),
  version: v.optional(v.string(), "OIDC_VERSION_1_0"),
  noneCompliant: v.optional(v.boolean(), false),
  devMode: v.optional(v.boolean(), false),
  accessTokenType: v.optional(v.string(), "OIDC_TOKEN_TYPE_BEARER"),
  accessTokenRoleAssertion: v.optional(v.boolean(), false),
  idTokenRoleAssertion: v.optional(v.boolean(), false),
  idTokenUserinfoAssertion: v.optional(v.boolean(), false),
  additionalOrigins: v.optional(v.array(v.string()), []),
  skipNativeAppSuccessPage: v.boolean(),
  backChannelLogoutUri: v.optional(v.string(), ""),
  loginVersion: loginVersionSchema,
})
const applicationSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  details: objectDetailsSchema,
  state: v.literal("APP_STATE_ACTIVE"),
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  oidcConfig: oidcConfigurationSchema,
})
const applicationsResponseSchema = v.object({ result: v.optional(v.array(applicationSchema), []) })
const applicationResponseSchema = v.object({ app: applicationSchema })
const applicationCreateResponseSchema = v.object({
  appId: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  details: objectDetailsSchema,
  clientId: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  clientSecret: v.optional(v.string(), ""),
  noneCompliant: v.optional(v.boolean(), false),
})

type Configuration = v.InferOutput<typeof configurationSchema>
type Project = v.InferOutput<typeof projectSchema>
type Application = v.InferOutput<typeof applicationSchema>

type Summary = {
  operation: "oidc-test-client-configure"
  mode: "dry-run" | "apply"
  organization: { id: string; name: string; exactMatch: true; active: true }
  instanceRouting: {
    loginV2Required: false
    action: "existing" | "would-update" | "updated"
    applicationPreferenceEnabled: true
  }
  project: { id?: string; name: string; action: "existing" | "would-create" | "created" }
  application: {
    id?: string
    name: string
    clientId?: string
    action: "existing" | "would-create" | "created"
    publicClient: true
    pkceMethod: "S256"
    redirectUri: string
    loginBaseUri: string
    loginV2FallbackPreserved: true
  }
}

const projectName = "ZITADEL Login E2E"
const applicationName = "ZITADEL Login Agent E2E"
const redirectUri = "http://127.0.0.1:17654/callback"
const loginBaseUri = "https://login.contentoren.de"

function configurationParse(input: NodeJS.ProcessEnv): Result<Configuration> {
  const op = "configurationParse"
  const parsed = v.safeParse(configurationSchema, input)
  if (!parsed.success) {
    const fields = [
      ...new Set(parsed.issues.flatMap((issue) => issue.path?.map((item) => String(item.key)) ?? []).filter(Boolean)),
    ]
    return resultErrorCreate(op, "Invalid or missing environment configuration", { fields })
  }
  return resultCreate(parsed.output)
}

async function apiRequest<T>(
  configuration: Configuration,
  op: string,
  path: string,
  schema: v.GenericSchema<unknown, T>,
  init?: RequestInit,
): Promise<Result<T>> {
  let response: Response
  try {
    response = await fetch(`${configuration.ZITADEL_ORIGIN}${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${configuration.ZITADEL_ADMIN_PAT}`,
        "x-zitadel-orgid": configuration.ZITADEL_ORGANIZATION_ID,
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

async function organizationValidate(configuration: Configuration): Promise<Result<true>> {
  const op = "organizationValidate"
  const response = await apiRequest(configuration, op, "/v2/organizations/_search", organizationsResponseSchema, {
    method: "POST",
    body: JSON.stringify({
      query: { limit: 2 },
      queries: [
        { idQuery: { id: configuration.ZITADEL_ORGANIZATION_ID } },
        {
          nameQuery: {
            name: configuration.ZITADEL_ORGANIZATION_NAME,
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
  if (
    organization?.id !== configuration.ZITADEL_ORGANIZATION_ID ||
    organization.name !== configuration.ZITADEL_ORGANIZATION_NAME
  ) {
    return resultErrorCreate(op, "Resolved organization did not exactly match configuration")
  }
  return resultCreate(true)
}

async function instanceRoutingConfigure(
  configuration: Configuration,
): Promise<Result<Summary["instanceRouting"]["action"]>> {
  const op = "instanceRoutingConfigure"
  const current = await apiRequest(configuration, op, "/v2/features/instance", instanceFeaturesSchema)
  if (!current.success) return current
  if (current.data.loginV2.baseUri) {
    return resultErrorCreate(op, "Instance Login V2 has a global base URI; refusing to replace it")
  }
  if (!current.data.loginV2.required) return resultCreate("existing")
  if (configuration.ZITADEL_E2E_MODE === "dry-run") return resultCreate("would-update")

  const updated = await apiRequest(configuration, op, "/v2/features/instance", emptyResponseSchema, {
    method: "PUT",
    body: JSON.stringify({ loginV2: { required: false } }),
  })
  if (!updated.success) return updated

  const verified = await apiRequest(configuration, op, "/v2/features/instance", instanceFeaturesSchema)
  if (!verified.success) return verified
  if (verified.data.loginV2.required || verified.data.loginV2.baseUri) {
    return resultErrorCreate(op, "Instance Login V2 routing prerequisite did not verify")
  }
  return resultCreate("updated")
}

function projectValidate(configuration: Configuration, project: Project): Result<true> {
  const op = "projectValidate"
  if (project.details.resourceOwner !== configuration.ZITADEL_ORGANIZATION_ID || project.name !== projectName) {
    return resultErrorCreate(op, "Project identity did not exactly match the configured organization and name")
  }
  if (
    project.projectRoleAssertion ||
    project.projectRoleCheck ||
    !project.hasProjectCheck ||
    project.privateLabelingSetting !== "PRIVATE_LABELING_SETTING_UNSPECIFIED"
  ) {
    return resultErrorCreate(op, "Existing dedicated project configuration differs; refusing to modify it")
  }
  return resultCreate(true)
}

async function projectGet(configuration: Configuration, projectId: string): Promise<Result<Project>> {
  const op = "projectGet"
  const response = await apiRequest(
    configuration,
    op,
    `/management/v1/projects/${encodeURIComponent(projectId)}`,
    v.object({ project: projectSchema }),
  )
  if (!response.success) return response
  const validated = projectValidate(configuration, response.data.project)
  if (!validated.success) return validated
  return resultCreate(response.data.project)
}

async function projectResolve(
  configuration: Configuration,
): Promise<Result<{ project?: Project; action: Summary["project"]["action"] }>> {
  const op = "projectResolve"
  const response = await apiRequest(configuration, op, "/management/v1/projects/_search", projectsResponseSchema, {
    method: "POST",
    body: JSON.stringify({
      query: { limit: 2 },
      queries: [
        { nameQuery: { name: projectName, method: "TEXT_QUERY_METHOD_EQUALS" } },
        { projectResourceOwnerQuery: { resourceOwner: configuration.ZITADEL_ORGANIZATION_ID } },
      ],
    }),
  })
  if (!response.success) return response
  if (response.data.result.length > 1) {
    return resultErrorCreate(op, "Multiple projects matched the dedicated exact name")
  }

  const existing = response.data.result[0]
  if (existing) {
    const validated = projectValidate(configuration, existing)
    if (!validated.success) return validated
    return resultCreate({ project: existing, action: "existing" })
  }
  if (configuration.ZITADEL_E2E_MODE === "dry-run") return resultCreate({ action: "would-create" })

  const created = await apiRequest(configuration, op, "/management/v1/projects", projectCreateResponseSchema, {
    method: "POST",
    body: JSON.stringify({
      name: projectName,
      projectRoleAssertion: false,
      projectRoleCheck: false,
      hasProjectCheck: true,
      privateLabelingSetting: "PRIVATE_LABELING_SETTING_UNSPECIFIED",
    }),
  })
  if (!created.success) return created
  if (created.data.details.resourceOwner !== configuration.ZITADEL_ORGANIZATION_ID) {
    return resultErrorCreate(op, "Created project has an unexpected resource owner")
  }

  const verified = await projectGet(configuration, created.data.id)
  if (!verified.success) return verified
  return resultCreate({ project: verified.data, action: "created" })
}

function valuesMatch(actual: string[], expected: string[]): boolean {
  return actual.length === expected.length && actual.every((value) => expected.includes(value))
}

function applicationValidate(configuration: Configuration, application: Application): Result<true> {
  const op = "applicationValidate"
  const oidc = application.oidcConfig
  if (
    application.details.resourceOwner !== configuration.ZITADEL_ORGANIZATION_ID ||
    application.name !== applicationName
  ) {
    return resultErrorCreate(op, "Application identity did not exactly match the configured organization and name")
  }
  if (
    !valuesMatch(oidc.redirectUris, [redirectUri]) ||
    !valuesMatch(oidc.responseTypes, ["OIDC_RESPONSE_TYPE_CODE"]) ||
    !valuesMatch(oidc.grantTypes, ["OIDC_GRANT_TYPE_AUTHORIZATION_CODE"]) ||
    oidc.appType !== "OIDC_APP_TYPE_NATIVE" ||
    oidc.authMethodType !== "OIDC_AUTH_METHOD_TYPE_NONE" ||
    oidc.version !== "OIDC_VERSION_1_0" ||
    oidc.noneCompliant ||
    oidc.devMode ||
    oidc.accessTokenType !== "OIDC_TOKEN_TYPE_BEARER" ||
    oidc.accessTokenRoleAssertion ||
    oidc.idTokenRoleAssertion ||
    oidc.idTokenUserinfoAssertion ||
    oidc.postLogoutRedirectUris.length !== 0 ||
    oidc.additionalOrigins.length !== 0 ||
    !oidc.skipNativeAppSuccessPage ||
    oidc.backChannelLogoutUri !== "" ||
    oidc.loginVersion.loginV2.baseUri !== loginBaseUri
  ) {
    return resultErrorCreate(op, "Existing dedicated OIDC application differs; refusing to modify it")
  }
  return resultCreate(true)
}

async function applicationGet(
  configuration: Configuration,
  projectId: string,
  applicationId: string,
): Promise<Result<Application>> {
  const op = "applicationGet"
  const response = await apiRequest(
    configuration,
    op,
    `/management/v1/projects/${encodeURIComponent(projectId)}/apps/${encodeURIComponent(applicationId)}`,
    applicationResponseSchema,
  )
  if (!response.success) return response
  const validated = applicationValidate(configuration, response.data.app)
  if (!validated.success) return validated
  return resultCreate(response.data.app)
}

async function applicationResolve(
  configuration: Configuration,
  project: Project | undefined,
): Promise<Result<{ application?: Application; action: Summary["application"]["action"] }>> {
  const op = "applicationResolve"
  if (!project) return resultCreate({ action: "would-create" })

  const response = await apiRequest(
    configuration,
    op,
    `/management/v1/projects/${encodeURIComponent(project.id)}/apps/_search`,
    applicationsResponseSchema,
    {
      method: "POST",
      body: JSON.stringify({
        query: { limit: 2 },
        queries: [{ nameQuery: { name: applicationName, method: "TEXT_QUERY_METHOD_EQUALS" } }],
      }),
    },
  )
  if (!response.success) return response
  if (response.data.result.length > 1) {
    return resultErrorCreate(op, "Multiple applications matched the dedicated exact name")
  }

  const existing = response.data.result[0]
  if (existing) {
    const validated = applicationValidate(configuration, existing)
    if (!validated.success) return validated
    return resultCreate({ application: existing, action: "existing" })
  }
  if (configuration.ZITADEL_E2E_MODE === "dry-run") return resultCreate({ action: "would-create" })

  const created = await apiRequest(
    configuration,
    op,
    `/management/v1/projects/${encodeURIComponent(project.id)}/apps/oidc`,
    applicationCreateResponseSchema,
    {
      method: "POST",
      body: JSON.stringify({
        name: applicationName,
        redirectUris: [redirectUri],
        responseTypes: ["OIDC_RESPONSE_TYPE_CODE"],
        grantTypes: ["OIDC_GRANT_TYPE_AUTHORIZATION_CODE"],
        appType: "OIDC_APP_TYPE_NATIVE",
        authMethodType: "OIDC_AUTH_METHOD_TYPE_NONE",
        postLogoutRedirectUris: [],
        version: "OIDC_VERSION_1_0",
        devMode: false,
        accessTokenType: "OIDC_TOKEN_TYPE_BEARER",
        accessTokenRoleAssertion: false,
        idTokenRoleAssertion: false,
        idTokenUserinfoAssertion: false,
        additionalOrigins: [],
        skipNativeAppSuccessPage: true,
        backChannelLogoutUri: "",
        loginVersion: { loginV2: { baseUri: loginBaseUri } },
      }),
    },
  )
  if (!created.success) return created
  if (
    created.data.details.resourceOwner !== configuration.ZITADEL_ORGANIZATION_ID ||
    created.data.clientSecret !== "" ||
    created.data.noneCompliant
  ) {
    return resultErrorCreate(op, "Created application is not a compliant public client in the expected organization")
  }

  const verified = await applicationGet(configuration, project.id, created.data.appId)
  if (!verified.success) return verified
  if (verified.data.oidcConfig.clientId !== created.data.clientId) {
    return resultErrorCreate(op, "Created application client identity did not verify")
  }
  return resultCreate({ application: verified.data, action: "created" })
}

async function oidcTestClientConfigure(): Promise<Result<Summary>> {
  const configuration = configurationParse(process.env)
  if (!configuration.success) return configuration

  const organization = await organizationValidate(configuration.data)
  if (!organization.success) return organization

  const instanceRouting = await instanceRoutingConfigure(configuration.data)
  if (!instanceRouting.success) return instanceRouting

  const project = await projectResolve(configuration.data)
  if (!project.success) return project

  const application = await applicationResolve(configuration.data, project.data.project)
  if (!application.success) return application

  return resultCreate({
    operation: "oidc-test-client-configure",
    mode: configuration.data.ZITADEL_E2E_MODE,
    organization: {
      id: configuration.data.ZITADEL_ORGANIZATION_ID,
      name: configuration.data.ZITADEL_ORGANIZATION_NAME,
      exactMatch: true,
      active: true,
    },
    instanceRouting: {
      loginV2Required: false,
      action: instanceRouting.data,
      applicationPreferenceEnabled: true,
    },
    project: {
      ...(project.data.project ? { id: project.data.project.id } : {}),
      name: projectName,
      action: project.data.action,
    },
    application: {
      ...(application.data.application
        ? {
            id: application.data.application.id,
            clientId: application.data.application.oidcConfig.clientId,
          }
        : {}),
      name: applicationName,
      action: application.data.action,
      publicClient: true,
      pkceMethod: "S256",
      redirectUri,
      loginBaseUri,
      loginV2FallbackPreserved: true,
    },
  })
}

const result = await oidcTestClientConfigure()
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
