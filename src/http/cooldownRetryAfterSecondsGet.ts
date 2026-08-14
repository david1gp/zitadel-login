import type { CooldownMetadata } from "./cooldownMetadataSchema"

export function cooldownRetryAfterSecondsGet(metadata: CooldownMetadata): number {
  return Math.max(1, metadata.cooldownRemainingSeconds)
}
