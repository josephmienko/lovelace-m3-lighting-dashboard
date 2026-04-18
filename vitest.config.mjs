import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup-vitest.mjs"],
    include: ["tests/**/*.test.mjs"],
    restoreMocks: true,
  },
});
