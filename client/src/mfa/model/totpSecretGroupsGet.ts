export function totpSecretGroupsGet(secret: string): string[] {
  const groups: string[] = []
  for (let index = 0; index < secret.length; index += 4) {
    groups.push(secret.slice(index, index + 4))
  }
  return groups
}
