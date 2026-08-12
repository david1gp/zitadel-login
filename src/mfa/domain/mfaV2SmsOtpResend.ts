import type { FlowV2Cookie } from "../../flow/model/flowV2CookieSchema"
import type { zitadelClientCreate } from "../../zitadel/zitadelClientCreate"
import { mfaV2SmsOtpChallenge } from "./mfaV2SmsOtpChallenge"

type Input = {
  state: Extract<FlowV2Cookie, { stage: "mfa" | "mfa_sms_otp_code" }>
  method?: string
  now: number
  client: ReturnType<typeof zitadelClientCreate>
}

export async function mfaV2SmsOtpResend(input: Input) {
  return mfaV2SmsOtpChallenge(input)
}
