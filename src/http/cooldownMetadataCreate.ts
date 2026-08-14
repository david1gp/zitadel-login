import type { CooldownMetadata } from "./cooldownMetadataSchema"
import { cooldownRemainingSecondsGet } from "./cooldownRemainingSecondsGet"

export function cooldownMetadataCreate(expiresAt: number, now: number): CooldownMetadata {
  return {
    cooldownExpiresAt: expiresAt,
    cooldownRemainingSeconds: cooldownRemainingSecondsGet(expiresAt, now),
  }
}
