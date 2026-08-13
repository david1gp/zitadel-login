import { flowV2TransitionApiRequest } from "../../flow/api/flowV2TransitionApiRequest"
import type { FlowV2Transition } from "../../flow/model/flowV2TransitionSchema"
import type { Result } from "../../result/Result"

export async function passkeyV2ChallengeApiRequest(
  apiOrigin: string,
  flowHandle: string,
  input: { identifier?: string; csrfToken: string },
): Promise<Result<FlowV2Transition>> {
  const op = "passkeyV2ChallengeApiRequest"
  const url = new URL("/api/v2/passkey/challenge", apiOrigin || window.location.origin)
  url.searchParams.set("flow", flowHandle)
  return flowV2TransitionApiRequest(
    url,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(input.identifier ? { identifier: input.identifier } : {}),
        csrfToken: input.csrfToken,
      }),
    },
    op,
  )
}
