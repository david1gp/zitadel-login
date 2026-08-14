import { resultCreate } from "../../result/resultCreate"
import { resultErrorCreate } from "../../result/resultErrorCreate"
import { emailOtpCooldownClientCreate } from "./emailOtpCooldownClientCreate"

export async function emailOtpCooldownSendReserve(
  cooldown: ReturnType<typeof emailOtpCooldownClientCreate>,
  now: number,
) {
  const reserved = await cooldown.reserve(now)
  if (!reserved.success) return reserved
  if (!reserved.data.accepted) {
    return resultErrorCreate("emailOtpCooldownSendReserve", "rate_limited", { expiresAt: reserved.data.expiresAt })
  }
  return resultCreate(reserved.data.expiresAt)
}
