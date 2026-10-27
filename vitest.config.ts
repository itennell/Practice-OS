import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 20_000,
    // Several files use the same live database (Dana's demo); run files one at a time so they don't race.
    fileParallelism: false,
  },
});
