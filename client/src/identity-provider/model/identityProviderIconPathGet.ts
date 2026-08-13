import { mdiAccountNetworkOutline } from "@adaptive-ds/mdi/mdiAccountNetworkOutline.js"
import { mdiApple } from "@adaptive-ds/mdi/mdiApple.js"
import { mdiCertificateOutline } from "@adaptive-ds/mdi/mdiCertificateOutline.js"
import { mdiGithub } from "@adaptive-ds/mdi/mdiGithub.js"
import { mdiGitlab } from "@adaptive-ds/mdi/mdiGitlab.js"
import { mdiGoogle } from "@adaptive-ds/mdi/mdiGoogle.js"
import { mdiIdentifier } from "@adaptive-ds/mdi/mdiIdentifier.js"
import { mdiMicrosoft } from "@adaptive-ds/mdi/mdiMicrosoft.js"
import { mdiOpenid } from "@adaptive-ds/mdi/mdiOpenid.js"
import { mdiShieldAccountOutline } from "@adaptive-ds/mdi/mdiShieldAccountOutline.js"
import { mdiWeb } from "@adaptive-ds/mdi/mdiWeb.js"

export function identityProviderIconPathGet(type: string, name = ""): string {
  const key = `${type} ${name}`.toLowerCase()
  if (key.includes("apple")) return mdiApple
  if (key.includes("azure") || key.includes("microsoft")) return mdiMicrosoft
  if (key.includes("google")) return mdiGoogle
  if (key.includes("github")) return mdiGithub
  if (key.includes("gitlab")) return mdiGitlab
  if (key.includes("jwt")) return mdiIdentifier
  if (key.includes("ldap")) return mdiAccountNetworkOutline
  if (key.includes("saml")) return mdiCertificateOutline
  if (key.includes("oidc") || key.includes("openid")) return mdiOpenid
  if (key.includes("oauth")) return mdiShieldAccountOutline
  return mdiWeb
}
