import { classArr } from "../classArr"

export const classesDemoNav = classArr(
  "flex flex-col gap-3.5 min-h-0 px-4 pt-5 pb-7 border-r-0 border-b border-foreground-14 bg-demo-nav",
  "lg:border-r lg:border-b-0",
  "data-[chrome=sidebar]:lg:overflow-hidden",
  "data-[chrome=compact]:min-h-0 data-[chrome=compact]:border-r-0 data-[chrome=compact]:border-b",
)
