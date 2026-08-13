import type { Result } from "../../result/Result"
import type { FlowV2Transition } from "../model/flowV2TransitionSchema"
import { flowV2TransitionApiRequest } from "./flowV2TransitionApiRequest"

export async function flowV2ResumeApiRequest(apiOrigin: string, flowHandle: string): Promise<Result<FlowV2Transition>> {
  const op = "flowV2ResumeApiRequest"
  const url = new URL("/api/v2/flow/resume", apiOrigin || window.location.origin)
  url.searchParams.set("flow", flowHandle)
  return flowV2TransitionApiRequest(url, { credentials: "include" }, op)
}
