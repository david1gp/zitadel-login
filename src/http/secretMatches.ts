export function secretMatches(actual: string, expected: string): boolean {
  const length = Math.max(actual.length, expected.length)
  let difference = actual.length ^ expected.length
  for (let index = 0; index < length; index += 1) {
    difference |= (actual.charCodeAt(index) || 0) ^ (expected.charCodeAt(index) || 0)
  }
  return difference === 0
}
