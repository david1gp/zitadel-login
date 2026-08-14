export function lastUsedLoginMethodCandidateKey(flowHandle: string): string {
  return `zitadel-login:last-used-primary-candidate:v1:${encodeURIComponent(flowHandle)}`
}
