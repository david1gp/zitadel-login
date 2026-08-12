import type { FlowV2Transition } from "../../flow/model/flowV2TransitionSchema"

export type PasswordChangeRequiredOutcome =
  | { status: "transition"; transition: FlowV2Transition }
  | { status: "retryable"; errorMessage: string; csrfToken: string; expiresAt: number }
