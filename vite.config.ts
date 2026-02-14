import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    entries: ["index.html", "pill.html"]
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        pill: resolve(__dirname, "pill.html")
      }
    }
  },
  server: {
    watch: {
      ignored: ["**/voicewave-prototype/**"]
    }
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts"
  }
});
