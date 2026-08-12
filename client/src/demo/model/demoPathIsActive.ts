export function demoPathIsActive(pathname: string): boolean {
  return pathname === "/demo" || pathname.startsWith("/demo/")
}
