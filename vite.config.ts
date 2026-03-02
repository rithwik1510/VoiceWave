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
    setupFiles: "./src/test/setup.ts",
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/test/**", "src/**/*.test.{ts,tsx}"],
      thresholds: {
        lines: 45,
        branches: 65,
        functions: 45,
        statements: 45
      }
    }
  }
});
