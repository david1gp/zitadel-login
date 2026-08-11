const callbackParameterNames = new Set(["code", "state", "error", "error_description", "error_uri"])

export function flowCallbackUrlIsOwned(callbackValue: string, redirectValue: string): boolean {
  try {
    const callback = new URL(callbackValue)
    const redirect = new URL(redirectValue)
    if (
      callback.origin !== redirect.origin ||
      callback.pathname !== redirect.pathname ||
      callback.hash !== redirect.hash
    ) {
      return false
    }
    if (callback.username || callback.password || redirect.username || redirect.password) return false
    for (const key of new Set(redirect.searchParams.keys())) {
      const expected = redirect.searchParams.getAll(key)
      const actual = callback.searchParams.getAll(key)
      if (expected.length !== actual.length || expected.some((value, index) => value !== actual[index])) return false
    }
    for (const key of new Set(callback.searchParams.keys())) {
      if (!redirect.searchParams.has(key) && !callbackParameterNames.has(key)) return false
      if (callbackParameterNames.has(key) && callback.searchParams.getAll(key).length !== 1) return false
    }
    return true
  } catch {
    return false
  }
}
