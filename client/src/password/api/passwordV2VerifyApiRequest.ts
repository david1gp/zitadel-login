import { flowV2TransitionApiRequest } from "../../flow/api/flowV2TransitionApiRequest"
import type { FlowV2Transition } from "../../flow/model/flowV2TransitionSchema"
import type { Result } from "../../result/Result"

export async function passwordV2VerifyApiRequest(
  apiOrigin: string,
  flowHandle: string,
  input: { identifier: string; password: string; csrfToken: string },
): Promise<Result<FlowV2Transition>> {
  const op = "passwordV2VerifyApiRequest"
  const url = new URL("/api/v2/password/verify", apiOrigin || window.location.origin)
  url.searchParams.set("flow", flowHandle)
  return flowV2TransitionApiRequest(
    url,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: input.identifier,
        password: input.password,
        csrfToken: input.csrfToken,
      }),
    },
    op,
  )
}
