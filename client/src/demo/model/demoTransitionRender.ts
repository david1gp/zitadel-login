import type { FlowV2Transition } from "../../flow/model/flowV2TransitionSchema"
import { demoCsrfToken } from "./demoCsrfToken"

export function demoTransitionRender(
  route: string,
  screen: Extract<FlowV2Transition, { kind: "render" }>["screen"],
): FlowV2Transition {
  return {
    kind: "render",
    route,
    screen,
    csrfToken: demoCsrfToken,
  }
}
