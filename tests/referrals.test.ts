import { describe, expect, it } from "vitest";
import fixture from "./fixtures/nppes-60614.json";
import { NeedsConnectError } from "../lib/connect";
import { createDraft, gmailToken, mimeMessage } from "../lib/referrals/gmail";
import { checkLetter } from "../lib/referrals/outreach";
import { haversineMiles, nearbyZips, zipCenters, zipDistance } from "../lib/referrals/geo";
import {
  fetchProviders,
  parseResponses,
  parseResult,
  searchUrl,
  specialtyForCode,
  type NppesResponse,
  type NppesResult,
} from "../lib/referrals/nppes";

const responses = fixture.responses as unknown as NppesResponse[];

describe("NPPES parsing (recorded 60614 reply, no live calls)", () => {
  it("keeps only providers whose PRIMARY specialty we want, active, with a location", () => {
    const all = responses.flatMap((r) => r.results ?? []);
    const kept = parseResponses(responses);
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.length).toBeLessThanOrEqual(all.length);
    for (const p of kept) {
      const raw = all.find((r) => String(r.number) === p.npi)!;
      const primary = raw.taxonomies!.find((t) => t.primary)!;
      expect(primary.code).toBe(p.taxonomy);
      expect(specialtyForCode(p.taxonomy)?.id).toBe(p.specialty);
      expect(p.zip).toMatch(/^\d{5}$/);
    }
  });

  it("drops a group whose matching specialty is only a secondary one", () => {
    const nurseGroup = responses[0].results!.find((r) =>
      r.taxonomies?.some((t) => t.code === "207Q00000X" && !t.primary) && !specialtyForCode(r.taxonomies!.find((t) => t.primary)!.code),
    );
    expect(nurseGroup).toBeDefined();
    expect(parseResult(nurseGroup!)).toBeNull();
  });

  it("formats a person as 'First Last, CREDENTIAL' and an organization by its name", () => {
    const base: NppesResult = {
      number: "1234567893",
      enumeration_type: "NPI-1",
      basic: { status: "A", first_name: "JANE", last_name: "O'NEIL", credential: "M.D." },
      addresses: [{ address_purpose: "LOCATION", address_1: "100 W FULLERTON AVE", city: "CHICAGO", state: "IL", postal_code: "606141234", telephone_number: "3125550100" }],
      taxonomies: [{ code: "207Q00000X", primary: true }],
    };
    const person = parseResult(base)!;
    expect(person).toMatchObject({ name: "Jane O'Neil, MD", npiType: "individual", zip: "60614", phone: "312-555-0100", specialtyLabel: "Family medicine" });
    const org = parseResult({ ...base, enumeration_type: "NPI-2", basic: { status: "A", organization_name: "LAKEVIEW CLINIC LLC" } })!;
    expect(org).toMatchObject({ name: "Lakeview Clinic LLC", organization: "Lakeview Clinic LLC", practiceName: "Lakeview Clinic LLC", npiType: "organization", credential: null });
    expect(parseResult({ ...base, basic: { ...base.basic, status: "D" } })).toBeNull();
    expect(parseResult(base, new Set(["oncology"]))).toBeNull();
  });

  it("removes duplicates by NPI and by same name at the same address", () => {
    const one = responses[0].results!.find((r) => parseResult(r))!;
    const twin = { ...one, number: "1999999999" };
    expect(parseResponses([{ results: [one, one, twin] }])).toHaveLength(1);
  });

  it("pages 200 at a time and stops on a short page or an NPPES error", async () => {
    const urls: string[] = [];
    const full = Array.from({ length: 200 }, () => responses[0].results![0]);
    await fetchProviders(["oncology"], ["60614"], async (url) => {
      urls.push(url);
      const skip = Number(new URL(url).searchParams.get("skip"));
      if (url.includes("Hematology")) return skip === 0 ? { results: full } : { results: [] };
      return { Errors: [{ description: "No taxonomy codes found" }] };
    });
    expect(urls.filter((u) => u.includes("Hematology")).map((u) => new URL(u).searchParams.get("skip"))).toEqual(["0", "200"]);
    expect(urls).toHaveLength(5);
    expect(searchUrl("OB & GYN", "60614")).toContain("taxonomy_description=OB+%26+GYN");
  });
});

describe("ZIP centers (Census 2020 ZCTA Gazetteer, every state)", () => {
  it("covers every state and measures miles", async () => {
    const all = await zipCenters();
    expect(Object.keys(all).length).toBeGreaterThan(33_000);
    for (const zip of ["60614", "99501", "96813", "10001", "00601"]) expect(all[zip]).toHaveLength(2);
    // Lincoln Park to the Loop is about 3 miles.
    expect(zipDistance(all, "60614", "60603")).toBeGreaterThan(2);
    expect(zipDistance(all, "60614", "60603")).toBeLessThan(5);
    expect(zipDistance(all, "60614", "00000")).toBeNull();
    expect(Math.round(haversineMiles([41.88, -87.63], [40.71, -74.01]))).toBeGreaterThan(700);
  });

  it("finds the ZIP and its nearest neighbors", async () => {
    const all = await zipCenters();
    const near = nearbyZips(all, "60614", 3, 5);
    expect(near[0]).toBe("60614");
    expect(near).toHaveLength(5);
    for (const z of near) expect(zipDistance(all, "60614", z)!).toBeLessThanOrEqual(3);
  });
});

describe("letter rules (no fees, gifts or anything of value)", () => {
  const ok =
    "Dear Dr. Lee, I'm Dana Reyes, a counselor in Lincoln Park who sees adults with anxiety and big life changes. " +
    "Would you be open to a 15-minute call to introduce ourselves?";
  it("lets a plain introduction through", () => {
    expect(checkLetter(ok)).toEqual({ ok: true });
  });
  it.each([
    ["$50 for every new client", "a dollar amount"],
    ["Happy to cover lunch for your staff.", "a gift"],
    ["We can talk about my fees.", "money or payment"],
    ["Thank you in exchange for referrals.", "something in return"],
  ])("refuses %s", (extra, why) => {
    const check = checkLetter(`${ok} ${extra}`);
    expect(check.ok).toBe(false);
    expect(!check.ok && check.reason).toContain(why);
  });
});

describe("Gmail draft message", () => {
  it("is RFC 2822 with To, Subject and a base64 body; no From, no Bcc", () => {
    const raw = mimeMessage("test-inbox@example.com", "Introduction — Reyes Counseling", "Hi\nthere");
    expect(raw).toMatch(/^To: test-inbox@example.com\r\n/);
    expect(raw).toContain("Subject: =?UTF-8?B?");
    expect(raw).not.toMatch(/^(From|Bcc|Cc):/m);
    expect(Buffer.from(raw.split("\r\n\r\n")[1], "base64").toString()).toBe("Hi\r\nthere");
    expect(() => mimeMessage("dr@clinic.com, other@x.com", "s", "b")).toThrow();
  });
  it("asks lib/connect for gmail.compose only, and turns 'not connected' into plain words", async () => {
    const asked: unknown[] = [];
    expect(await gmailToken((async (p: string, s: string[]) => (asked.push([p, s]), "tok")) as never)).toBe("tok");
    expect(asked).toEqual([["google", ["https://www.googleapis.com/auth/gmail.compose"]]]);
    const notConnected = (async () => {
      throw new NeedsConnectError("google", ["https://www.googleapis.com/auth/gmail.compose"]);
    }) as never;
    await expect(gmailToken(notConnected)).rejects.toThrow(/^Connect Google first: open Settings › Connections/);
    const down = (async () => {
      throw new Error("Couldn't reach Google just now.");
    }) as never;
    await expect(gmailToken(down)).rejects.toThrow("Couldn't reach Google just now.");
  });

  it("posts the draft to users.drafts.create and treats 401 as not connected", async () => {
    const calls: { url: string; body: string }[] = [];
    const ok = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: String(init.body) });
      return new Response(JSON.stringify({ id: "r-1", message: { id: "m-1" } }));
    }) as typeof fetch;
    expect(await createDraft("tok", { to: "a@example.com", subject: "s", body: "b" }, ok)).toEqual({ draftId: "r-1", messageId: "m-1" });
    expect(calls[0].url).toBe("https://gmail.googleapis.com/gmail/v1/users/me/drafts");
    expect(JSON.parse(calls[0].body).message.raw).toMatch(/^[A-Za-z0-9_-]+$/);
    const denied = (async () => new Response("", { status: 401 })) as unknown as typeof fetch;
    await expect(createDraft("tok", { to: "a@example.com", subject: "s", body: "b" }, denied)).rejects.toThrow(/Connect Google first/);
  });
});
