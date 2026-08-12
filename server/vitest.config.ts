import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["./src/test/setup.ts"],
    // The db module is a singleton bound to DB_PATH at import time, so each
    // test file needs its own process to get a clean database.
    fileParallelism: false,
    isolate: true,
    pool: "forks",
  },
});
