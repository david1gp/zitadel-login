import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import { zitadelClientCreate } from "../../zitadel/zitadelClientCreate"

type Input = {
  client: ReturnType<typeof zitadelClientCreate>
  email: string
  organizationId: string
  pagesOrigin: string
}

const passwordMethod = "AUTHENTICATION_METHOD_TYPE_PASSWORD"

export async function passwordResetDeliveryExecute(input: Input) {
  const op = "passwordResetDeliveryExecute"
  const settings = await input.client.loginSettingsGet(input.organizationId)
  if (!settings.success) return resultErrorCreate(op, "service_unavailable")
  if (settings.data.settings?.allowLocalAuthentication !== true || settings.data.settings.hidePasswordReset === true) {
    return resultCreate(undefined)
  }

  const users = await input.client.usersByEmailList(input.email)
  if (!users.success) return resultErrorCreate(op, "service_unavailable")

  const user = users.data.result.length === 1 ? users.data.result[0] : undefined
  if (
    user?.state !== "USER_STATE_ACTIVE" ||
    user.details?.resourceOwner !== input.organizationId ||
    user.human?.email?.isVerified !== true ||
    user.human.email.email.toLowerCase() !== input.email
  ) {
    return resultCreate(undefined)
  }

  const methods = await input.client.authenticationMethodsGet(user.userId)
  // Once a user is found, all native outcomes must remain indistinguishable from an unknown account.
  if (!methods.success) return resultCreate(undefined)
  if (!methods.data.authMethodTypes.includes(passwordMethod)) return resultCreate(undefined)

  const template = `${input.pagesOrigin}/api/v2/password/reset/ingress?userId={{.UserID}}&orgId={{.OrgID}}&code={{.Code}}`
  await input.client.passwordResetRequest(user.userId, template)
  return resultCreate(undefined)
}
