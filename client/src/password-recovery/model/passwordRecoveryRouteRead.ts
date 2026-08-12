export function passwordRecoveryRouteRead(pathname: string): "request" | "reset" | undefined {
  if (pathname === "/password/forgot" || pathname === "/password/forgot/") return "request"
  if (pathname === "/password/reset" || pathname === "/password/reset/") return "reset"
  return undefined
}
