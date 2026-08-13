import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"
import solid from "vite-plugin-solid"

export default defineConfig({
  plugins: [solid(), tailwindcss()],
  root: "client",
  build: {
    outDir: "../dist/client",
    emptyOutDir: true,
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    allowedHosts: ["localhost", "zitadel-login-dev.david-siewert.com"],
    hmr: {
      host: "zitadel-login-dev.david-siewert.com",
      protocol: "wss",
      clientPort: 443,
    },
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
})
