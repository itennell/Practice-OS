// The local app's front door (proxy.ts + lib/request-guard.ts): only this
// computer, and changes only from the app's own pages. No database needed.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { config, proxy } from "../proxy";
import { refusal } from "../lib/request-guard";

const HOST = "127.0.0.1:3000";
const req = (method: string, pathname: string, headers: Record<string, string> = {}) =>
  new NextRequest(`http://${HOST}${pathname}`, { method, headers: { host: HOST, ...headers } });

afterEach(() => {
  delete process.env.VERCEL;
});

describe("request guard", () => {
  it("refuses any request addressed to another name, reads included (DNS rebinding)", () => {
    expect(refusal(req("GET", "/api/approvals", { host: "attacker.example:3000" }))).toMatch(/this computer/);
    expect(refusal(req("GET", "/", { host: "localhost.attacker.example" }))).toMatch(/this computer/);
    expect(refusal(req("GET", "/api/approvals"))).toBeNull();
    expect(refusal(req("GET", "/", { host: "localhost:3000" }))).toBeNull();
    expect(refusal(req("GET", "/", { host: "[::1]:3000" }))).toBeNull();
  });

  it("lets a change through only from the app's own page", () => {
    const approve = "/api/approvals/00000000-0000-0000-0000-000000000000/approve";
    expect(refusal(req("POST", approve))).toMatch(/Practice-OS itself/); // no Origin, no Sec-Fetch-Site
    expect(refusal(req("POST", approve, { "sec-fetch-site": "cross-site" }))).toMatch(/Practice-OS itself/);
    expect(refusal(req("POST", approve, { "sec-fetch-site": "same-site" }))).toMatch(/Practice-OS itself/);
    expect(refusal(req("POST", approve, { origin: "https://evil.example" }))).toMatch(/Practice-OS itself/);
    expect(refusal(req("DELETE", "/api/memories/1", { origin: "http://localhost:3000" }))).toMatch(/Practice-OS itself/); // another origin on this machine
    expect(refusal(req("POST", approve, { "sec-fetch-site": "same-origin" }))).toBeNull();
    expect(refusal(req("PUT", "/api/settings/office", { origin: `http://${HOST}` }))).toBeNull();
    // A link or redirect from another site may open a page; it can't change anything.
    expect(refusal(req("GET", "/approvals", { "sec-fetch-site": "cross-site" }))).toBeNull();
  });

  it("stays out of the way on the Vercel copy, whose webhooks are posted to by other sites", () => {
    process.env.VERCEL = "1";
    expect(refusal(req("POST", "/api/twilio/voice", { host: "practice-os.vercel.app" }))).toBeNull();
  });

  it("answers a refused API call with 403 JSON before the route runs", async () => {
    const res = proxy(req("POST", "/api/approvals/x/approve", { "sec-fetch-site": "cross-site", "content-type": "text/plain" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Changes must come from Practice-OS itself." });
    const page = proxy(req("GET", "/approvals", { host: "attacker.example" }));
    expect(page.status).toBe(403);
    expect(proxy(req("POST", "/api/approvals/x/approve", { "sec-fetch-site": "same-origin" })).headers.get("x-middleware-next")).toBe("1");
  });

  it("covers every route that changes something", async () => {
    const matcher = new RegExp(`^${config.matcher[0].replace("/(", "/(?:").replace(/\(\?!/, "(?!")}$`);
    const routes: string[] = [];
    async function walk(dir: string) {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else if (entry.name === "route.ts" && /export (async )?function (POST|PUT|PATCH|DELETE)/.test(await readFile(full, "utf8"))) {
          routes.push("/" + path.relative("app", path.dirname(full)).replace(/\[[^\]]+\]/g, "x").split(path.sep).join("/"));
        }
      }
    }
    await walk("app/api");
    expect(routes.length).toBeGreaterThan(20);
    for (const route of routes) expect(route, route).toMatch(matcher);
  });
});

describe("the app's own servers", () => {
  it("listen only on this computer", async () => {
    const pkg = JSON.parse(await readFile("package.json", "utf8")) as { scripts: Record<string, string> };
    expect(pkg.scripts.dev).toContain("-H 127.0.0.1");
    expect(pkg.scripts.start).toContain("-H 127.0.0.1");
    expect(await readFile("playwright.config.ts", "utf8")).toContain("next start -H 127.0.0.1");
  });
});
