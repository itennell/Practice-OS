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
    // Front Desk's Connect Cal.com talks to a local fixture server in tests (tests/e2e/front-desk.spec.ts).
    // The specs expect a bare install: no Muse key (onboarding shows "Connect Aeon's brain") and no
    // phone, calendar or Instagram keys. Blank them so a filled-in .env doesn't change the screens
    // (dotenv never overrides a variable that is already set, even to "").
    env: {
      CALCOM_API_BASE: "http://127.0.0.1:3299",
      PLAYWRIGHT_CALCOM_STANDIN: "1",
      // Instagram research uses fixed notes with example.com links, except on a live run (PLAYWRIGHT_LIVE=1).
      PLAYWRIGHT_RESEARCH_STANDIN: process.env.PLAYWRIGHT_RESEARCH_STANDIN ?? (process.env.PLAYWRIGHT_LIVE === "1" ? "0" : "1"),
      // Reel slide edits get Muse's critic; without a key the specs use a stand-in that finds nothing (plain-code checks still run).
      PLAYWRIGHT_CRITIC_STANDIN: process.env.PLAYWRIGHT_LIVE === "1" ? "0" : "1",
      // The chat-first studio's models (research merge, words, slides, chat edits); off on a live run.
      PLAYWRIGHT_STUDIO_STANDIN: process.env.PLAYWRIGHT_LIVE === "1" ? "0" : "1",
      DRY_RUN: "true",
      FRONT_DESK_POLL: "off",
      ...Object.fromEntries(
        [
          // A live proof run (PLAYWRIGHT_LIVE=1, tests/e2e/instagram-studio-live.spec.ts) keeps the Muse key.
          ...(process.env.PLAYWRIGHT_LIVE === "1" ? [] : ["MODEL_API_KEY"]),
          "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "FRONT_DESK_DEV_TWILIO", "CLINICIAN_ALERT_PHONE",
          "CALCOM_API_KEY", "CALCOM_EVENT_TYPE_ID", "CALCOM_USERNAME", "CALCOM_EVENT_SLUG",
          "RELAY_URL", "INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET", "INSTAGRAM_ACCESS_TOKEN", "INSTAGRAM_USER_ID",
          "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "TEST_INBOX_EMAIL",
        ].map((k) => [k, ""]),
      ),
    },
  },
  projects: [
    { name: "desktop-light", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, colorScheme: "light" } },
    { name: "phone-dark", use: { ...devices["Pixel 7"], colorScheme: "dark" } },
  ],
});
