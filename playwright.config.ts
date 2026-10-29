import { defineConfig, devices } from "@playwright/test";

// End-to-end checks against a production build (next build && next start).
// They use the real database and reset the demo data first.
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  webServer: {
    command: "npm run build && npx next start -H 127.0.0.1 -p 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: true,
    timeout: 240_000,
    // Front Desk's Connect Cal.com talks to a local fixture server in tests (tests/e2e/front-desk.spec.ts).
    env: { CALCOM_API_BASE: "http://127.0.0.1:3299" },
  },
  projects: [
    { name: "desktop-light", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, colorScheme: "light" } },
    { name: "phone-dark", use: { ...devices["Pixel 7"], colorScheme: "dark" } },
  ],
});
