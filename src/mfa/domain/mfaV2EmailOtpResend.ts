import type { FlowV2Cookie } from "../../flow/model/flowV2CookieSchema"
import type { zitadelClientCreate } from "../../zitadel/zitadelClientCreate"
import { mfaV2EmailOtpChallenge } from "./mfaV2EmailOtpChallenge"

type Input = {
  state: Extract<FlowV2Cookie, { stage: "mfa" }>
  method?: string
  now: number
  client: ReturnType<typeof zitadelClientCreate>
}

export async function mfaV2EmailOtpResend(input: Input) {
  return mfaV2EmailOtpChallenge(input)
}
