export function demoPickerRead(search: string): boolean {
  return new URLSearchParams(search).get("picker") === "1"
}
