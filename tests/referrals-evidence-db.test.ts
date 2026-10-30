// Referrals v2 against the live database: facts per source, the merged result
// kept on the card, and the NPI Registry's answer saved with every search.
import { afterAll, describe, expect, it } from "vitest";
import { loadEnv } from "../lib/env";

loadEnv();
const hasDb = Boolean(process.env.DATABASE_URL);

const { closeDb, db } = await import("../lib/db");
const { addToBoard } = await import("../lib/referrals/store");
const { factsFor, saveFacts, evidenceFor } = await import("../lib/referrals/evidence/store");

const sources: string[] = [];

async function makeSource() {
  const npi = `19${String(Date.now() + sources.length).slice(-8)}`;
  const [row] = await db()`
    insert into practice_os.referral_sources (npi, name, taxonomy, specialty, npi_type, city, state, zip, phone)
    values (${npi}, 'Test Provider, MD', '207Q00000X', 'Family medicine', 'individual', 'Chicago', 'IL', '60614', '312-555-0100')
    returning id`;
  sources.push(row.id);
  return { id: row.id as string, npi };
}

afterAll(async () => {
  if (!hasDb) return;
  if (sources.length) await db()`delete from practice_os.referral_sources where id in ${db()(sources)}`;
  await closeDb();
});

const now = () => new Date().toISOString();

describe.skipIf(!hasDb)("referral evidence", () => {
  it("saves facts per source, merges them onto the card, and a source answering again replaces only its own", async () => {
    const { id } = await makeSource();
    await saveFacts(id, [
      { field: "npi_status", value: "active", origin: "nppes", method: "npi", checkedAt: now() },
      { field: "phone", value: "312-555-0100", origin: "nppes", method: "npi", checkedAt: now() },
      { field: "address", value: "1 Test Way, Chicago, IL 60614", origin: "nppes", method: "npi", checkedAt: now() },
    ]);
    let ev = await saveFacts(id, [
      { field: "address", value: "1 Test Way, Suite 2, Chicago, IL 60614", origin: "cms_dac", method: "npi", checkedAt: now() },
      { field: "phone", value: "312-555-0199", origin: "cms_dac", method: "npi", checkedAt: now() },
    ]);
    expect(ev.confidence).toBe("confirmed");
    expect(ev.conflicts).toEqual(["Phone differs between sources: Medicare clinician file 312-555-0199 and NPI Registry 312-555-0100."]);
    const [card] = await db()`select confidence, conflicts, checked_at from practice_os.referral_sources where id = ${id}`;
    expect(card.confidence).toBe("confirmed");
    expect(card.conflicts).toHaveLength(1);
    expect(card.checked_at).not.toBeNull();

    // Medicare answers again without a phone: its old phone goes, the conflict too.
    ev = await saveFacts(id, [{ field: "address", value: "1 Test Way, Chicago, IL 60614", origin: "cms_dac", method: "npi", checkedAt: now() }]);
    expect(ev.conflicts).toEqual([]);
    expect((await factsFor([id])).get(id)!.filter((f) => f.origin === "cms_dac")).toHaveLength(1);
    // Asked, nothing found: its facts are cleared.
    ev = await saveFacts(id, [], { checked: ["cms_dac"] });
    expect(ev.confidence).toBe("partly");
  });

  it("an email found on the board fills the card's email, and what she typed wins", async () => {
    const { id } = await makeSource();
    await saveFacts(id, [{ field: "email", value: "office@example.com", origin: "website", method: "name_address", checkedAt: now(), detail: { page: "https://example.com/contact" } }]);
    let [card] = await db()`select email from practice_os.referral_sources where id = ${id}`;
    expect(card.email).toBe("office@example.com");
    await saveFacts(id, [{ field: "email", value: "typed@example.com", origin: "clinician", method: "manual", checkedAt: now() }]);
    [card] = await db()`select email from practice_os.referral_sources where id = ${id}`;
    expect(card.email).toBe("typed@example.com");
    const ev = (await evidenceFor([{ id, npi_type: "individual" }]))[id];
    expect(ev.fields.email).toMatchObject({ value: "typed@example.com", confidence: "high" });
  });

  it("Add to board records the NPI Registry's answer as evidence", async () => {
    const npi = `19${String(Date.now()).slice(-8)}`;
    const { added } = await addToBoard([{ npi, distanceMiles: 0.4 }], db(), async () => ({
      npi, name: "Test Board, MD", organization: null, practiceName: null, npiType: "individual", credential: "MD",
      taxonomy: "207Q00000X", taxonomyLabel: "Family Medicine", specialty: "family_medicine", specialtyLabel: "Family medicine",
      address: "1 Test Way", city: "Chicago", state: "IL", zip: "60614", phone: "312-555-0100", homeAddress: false, fax: null,
      official: null, lastUpdated: "2025-01-01",
    }));
    sources.push(added[0].id!);
    const facts = (await factsFor([added[0].id!])).get(added[0].id!)!;
    expect(facts.map((f) => f.field).sort()).toEqual(["address", "credential", "name", "npi_status", "phone"]);
    expect(facts.every((f) => f.origin === "nppes" && f.method === "npi")).toBe(true);
  });
});
