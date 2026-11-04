import { defineConfig, devices } from "@playwright/test";

// End-to-end checks against a production build (next build && next start).
// They use the real database and reset the demo data first.
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    // Headless Chromium draws WebGL in software (SwiftShader) unless told to use the Mac's GPU;
    // then Liquid Aeon's shader compile freezes each page for ~6s and timing-based specs flake.
    launchOptions: { args: process.platform === "darwin" ? ["--use-angle=metal"] : [] },
  },
  webServer: {
    command: "npm run build && npx next start -H 127.0.0.1 -p 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: true,
    timeout: 240_000,
    // The specs expect a bare install: no Muse key (onboarding shows "Connect Aeon's brain").
    // Blank it so a filled-in .env doesn't change the screens (dotenv never overrides a
    // variable that is already set, even to "").
    env: {
      // The coffee debrief's transcriber and Muse (lib/referrals/debrief-standin.ts); off on a live run.
      PLAYWRIGHT_DEBRIEF_STANDIN: process.env.PLAYWRIGHT_LIVE === "1" ? "0" : "1",
      PRACTICE_OS_E2E: "1",
      DRY_RUN: "true",
      // A live proof run (PLAYWRIGHT_LIVE=1) keeps the Muse key.
      ...(process.env.PLAYWRIGHT_LIVE === "1" ? {} : { MODEL_API_KEY: "" }),
    },
  },
  projects: [
    { name: "desktop-light", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, colorScheme: "light" } },
    { name: "phone-dark", use: { ...devices["Pixel 7"], colorScheme: "dark" } },
  ],
});
