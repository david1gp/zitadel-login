import type { Result } from "../../result/Result"
import type { FlowV2Transition } from "../model/flowV2TransitionSchema"
import { flowV2TransitionApiRequest } from "./flowV2TransitionApiRequest"

export async function flowV2InitializeApiRequest(
  apiOrigin: string,
  authRequest: string,
): Promise<Result<FlowV2Transition>> {
  const op = "flowV2InitializeApiRequest"
  const url = new URL("/api/v2/flow/initialize", apiOrigin || window.location.origin)
  return flowV2TransitionApiRequest(
    url,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ authRequest }),
    },
    op,
  )
}
