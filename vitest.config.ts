import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // The app's "@/..." imports, so tests can call route handlers directly.
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 20_000,
    // Several files use the same live database (Dana's demo); run files one at a time so they don't race.
    fileParallelism: false,
  },
});
