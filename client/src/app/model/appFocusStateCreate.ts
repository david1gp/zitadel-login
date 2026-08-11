export function appFocusStateCreate() {
  let heading: HTMLHeadingElement | undefined
  let errorElement: HTMLDivElement | undefined

  const focusSchedule = (element: () => HTMLElement | undefined) => {
    queueMicrotask(() => element()?.focus())
  }

  return {
    headingRegister: (element: HTMLHeadingElement) => {
      heading = element
    },
    errorRegister: (element: HTMLDivElement) => {
      errorElement = element
    },
    focusHeading: () => focusSchedule(() => heading),
    focusError: () => focusSchedule(() => errorElement),
    focusSchedule,
  }
}
