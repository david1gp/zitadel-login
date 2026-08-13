import { classArr } from "../classArr"

export const classesThemeToggleButton = classArr(
  "inline-flex items-center justify-center size-[30px] min-h-[30px] border-0 rounded-full p-0",
  "text-inherit bg-transparent",
  "hover:enabled:not-aria-pressed:bg-primary-10",
  "aria-pressed:text-primary-foreground aria-pressed:bg-primary",
  "hover:enabled:aria-pressed:bg-primary",
)
