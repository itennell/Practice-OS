// Shared helpers for the scripts/spike-*.ts vendor spikes (Session A).
// Each spike makes one or more raw HTTP calls, prints them, and saves a redacted
// fixture to docs/spikes/<name>.json. No app code imports this file.
import { mkdir, writeFile } from "node:fs/promises";
import { loadEnv } from "../lib/env";

loadEnv();

export const SEND = process.argv.includes("--send");

// Exit with a plain message naming every missing .env line. Nothing is called.
export function requireEnv(spike: string, names: string[]): Record<string, string> {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) {
    console.error(`\n${spike}: cannot run yet. These lines in .env are empty or missing:\n`);
    for (const n of missing) console.error(`  ${n}=`);
    console.error(`\nFill them in (.env.example says where each one comes from), then run again.\n`);
    process.exit(1);
  }
  return Object.fromEntries(names.map((n) => [n, process.env[n] as string]));
}

export type Step = {
  request: { method: string; url: string; headers?: Record<string, string>; body?: unknown };
  status: number;
  headers: Record<string, string>;
  body: unknown;
};

const steps: Step[] = [];

// Headers worth seeing in a spike: versions, rate limits, request ids.
const INTERESTING = /(rate-?limit|retry-after|api-version|x-app-usage|business-use-case|x-ad-account-usage|twilio-|x-request-id|x-fb-|x-goog-|ratelimit)/i;

// Hide secrets in a URL before printing: query tokens and Twilio account sids.
function safeUrl(url: string): string {
  return redactString(url.replace(/([?&](access_token|key|client_secret|code)=)[^&]+/gi, "$1[redacted]"));
}

export async function call(
  method: string,
  url: string,
  init: { headers?: Record<string, string>; body?: string; logBody?: unknown } = {},
): Promise<Step> {
  const shownUrl = safeUrl(url);
  console.log(`\n> ${method} ${shownUrl}`);
  // Never print auth headers; show the rest (versions, content type).
  const shownHeaders = Object.fromEntries(
    Object.entries(init.headers ?? {}).filter(([k]) => !/authorization/i.test(k)),
  );
  if (Object.keys(shownHeaders).length) console.log(`  headers: ${JSON.stringify(shownHeaders)}`);
  if (init.logBody !== undefined) console.log(`  body: ${JSON.stringify(redact(init.logBody))}`);

  const res = await fetch(url, { method, headers: init.headers, body: init.body });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // Not JSON; keep the text.
  }
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    if (INTERESTING.test(k)) headers[k] = v;
  });
  console.log(`< HTTP ${res.status} ${res.statusText}`);
  for (const [k, v] of Object.entries(headers)) console.log(`  ${k}: ${v}`);
  // Printed redacted too: token responses and phone numbers stay off the terminal.
  console.log(JSON.stringify(redact(body), null, 2));

  const step: Step = {
    request: { method, url: shownUrl, headers: shownHeaders, body: init.logBody },
    status: res.status,
    headers,
    body,
  };
  steps.push(step);
  return step;
}

// --- redaction -------------------------------------------------------------

const SECRET_KEY = /(token|secret|password|authorization|api_?key|client_id|^code$|code_verifier|email|^to$|^from$|phone)/i;

function redactString(s: string): string {
  return s
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted]") // emails
    .replace(/\+\d{10,15}/g, "[redacted]") // E.164 phones
    .replace(/\bAC[0-9a-f]{32}\b/g, "[redacted]") // Twilio account sid
    .replace(/\bcal_(live_|test_)?[A-Za-z0-9]{16,}\b/g, "[redacted]") // Cal.com keys
    .replace(/\b(IG|EAA)[A-Za-z0-9]{40,}\b/g, "[redacted]") // Meta tokens
    .replace(/\bya29\.[A-Za-z0-9._-]+/g, "[redacted]") // Google access tokens
    .replace(/([?&](access_token|key|client_secret|code)=)[^&"\s]+/gi, "$1[redacted]");
}

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        redactString(k),
        SECRET_KEY.test(k) && typeof v === "string" ? "[redacted]" : redact(v),
      ]),
    );
  }
  return typeof value === "string" ? redactString(value) : value;
}

// docs/spikes/<name>.json: {ok, ran_at, request, status, body} for the last call, plus every step.
export async function saveFixture(name: string, ok: boolean, extra: Record<string, unknown> = {}) {
  if (!steps.length) return;
  const last = steps[steps.length - 1];
  const fixture = redact({
    ok,
    ran_at: new Date().toISOString(),
    request: last.request,
    status: last.status,
    body: last.body,
    ...extra,
    steps,
  });
  await mkdir("docs/spikes", { recursive: true });
  const file = `docs/spikes/${name}.json`;
  await writeFile(file, `${JSON.stringify(fixture, null, 2)}\n`);
  console.log(`\nSaved redacted fixture: ${file} (ok=${ok})`);
}

export function mask(phone: string): string {
  return phone.length > 4 ? `${"*".repeat(phone.length - 4)}${phone.slice(-4)}` : "****";
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
