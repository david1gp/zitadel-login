export function demoEmailMaskGet(email: string): string {
  const at = email.indexOf("@")
  if (at < 1) return email
  return `${email[0]}***${email.slice(at)}`
}
