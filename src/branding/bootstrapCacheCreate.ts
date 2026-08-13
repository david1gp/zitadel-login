type CacheEntry<T> = {
  data: T
  expiresAt: number
}

export function bootstrapCacheCreate<T>(maxEntries = 8) {
  const entries = new Map<string, CacheEntry<T>>()

  return {
    get(key: string, now: number): T | undefined {
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
    set(key: string, data: T, expiresAt: number): void {
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
