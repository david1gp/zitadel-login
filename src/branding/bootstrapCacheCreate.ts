import type { BootstrapView } from "./bootstrapViewSchema"

type CacheEntry = {
  data: BootstrapView
  expiresAt: number
}

export function bootstrapCacheCreate(maxEntries = 8) {
  const entries = new Map<string, CacheEntry>()

  return {
    get(key: string, now: number): BootstrapView | undefined {
      const entry = entries.get(key)
      if (!entry) return undefined
      if (entry.expiresAt <= now) {
        entries.delete(key)
        return undefined
      }
      entries.delete(key)
      entries.set(key, entry)
      return entry.data
    },
    set(key: string, data: BootstrapView, expiresAt: number): void {
      entries.delete(key)
      entries.set(key, { data, expiresAt })
      while (entries.size > maxEntries) {
        const oldest = entries.keys().next().value
        if (oldest === undefined) return
        entries.delete(oldest)
      }
    },
  }
}
