import { defineConfig } from "vitest/config"
import solid from "vite-plugin-solid"

export default defineConfig({
  plugins: [solid()],
  root: new URL("..", import.meta.url).pathname,
  test: {
    environment: "happy-dom",
    include: ["test/**/*.component.tsx"],
  },
})
