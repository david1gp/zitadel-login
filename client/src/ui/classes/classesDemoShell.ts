import { classArr } from "../classArr"

export const classesDemoShell = classArr(
  "group min-h-screen grid grid-cols-1",
  "lg:grid-cols-[minmax(240px,280px)_minmax(0,1fr)]",
  "data-[chrome=sidebar]:lg:h-dvh data-[chrome=sidebar]:lg:grid-rows-[minmax(0,1fr)] data-[chrome=sidebar]:lg:overflow-hidden",
  "data-[chrome=compact]:grid-cols-1",
)
