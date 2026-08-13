import { flowV2TransitionApiRequest } from "../../flow/api/flowV2TransitionApiRequest"
import type { FlowV2Transition } from "../../flow/model/flowV2TransitionSchema"
import type { Result } from "../../result/Result"
import type { PasskeyCredentialAssertion } from "../model/passkeyVerifyRequestSchema"

export async function passkeyV2VerifyApiRequest(
  apiOrigin: string,
  flowHandle: string,
  input: { credential: PasskeyCredentialAssertion; csrfToken: string },
): Promise<Result<FlowV2Transition>> {
  const op = "passkeyV2VerifyApiRequest"
  const url = new URL("/api/v2/passkey/verify", apiOrigin || window.location.origin)
  url.searchParams.set("flow", flowHandle)
  return flowV2TransitionApiRequest(
    url,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        credential: input.credential,
        csrfToken: input.csrfToken,
      }),
    },
    op,
  )
}
