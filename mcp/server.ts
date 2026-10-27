import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { APPROVAL_KINDS } from "../lib/approval-kinds";
import { isDryRun, loadEnv } from "../lib/env";

// Load .env from the repo root, wherever the MCP client starts us from.
// MCP client configs never carry secrets.
loadEnv(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));

// Imported after loadEnv so DATABASE_URL is set before the first query.
const { queueApproval } = await import("../lib/approvals");

const server = new McpServer({ name: "practice-os", version: "0.1.0" });

server.registerTool(
  "status",
  {
    title: "Practice-OS status",
    description: "Reports whether Practice-OS is running and whether it is in dry-run mode.",
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async () => ({
    content: [
      {
        type: "text",
        text: JSON.stringify({ ok: true, dryRun: isDryRun() }),
      },
    ],
  }),
);

const MAX_JSON_BYTES = 20_000;
const jsonObject = z
  .record(z.unknown())
  .refine((v) => Buffer.byteLength(JSON.stringify(v)) <= MAX_JSON_BYTES, {
    message: `Must be at most ${MAX_JSON_BYTES / 1000} KB as JSON.`,
  });

/** "mcp:<client>" from the MCP handshake, e.g. mcp:claude-code. */
function createdBy(): string {
  const name = server.server.getClientVersion()?.name ?? "unknown";
  const clean = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return `mcp:${clean || "unknown"}`;
}

// AGENTS.md > Approvals: agents and tools only INSERT pending approvals.
// Nothing is sent, posted or booked until the clinician approves in the app.
server.registerTool(
  "queue_approval",
  {
    title: "Queue for clinician approval",
    description:
      "Adds a draft action (a letter, post, text reply or booking) to the clinician's approvals inbox as pending. " +
      "Nothing is sent, posted or booked until she approves it in Practice-OS.",
    inputSchema: {
      kind: z.enum(APPROVAL_KINDS).describe("What kind of action this is."),
      title: z.string().trim().min(1).max(200).describe("A short line the clinician sees in her inbox."),
      preview: jsonObject.optional().describe("What the clinician sees before approving, e.g. { body: '...' }."),
      payload: jsonObject.optional().describe("What the executor needs to carry it out after approval."),
    },
    outputSchema: { status: z.literal("pending"), approval_id: z.string().uuid() },
    annotations: { destructiveHint: false, openWorldHint: false, idempotentHint: false },
  },
  async ({ kind, title, preview, payload }) => {
    const id = await queueApproval({ kind, title, preview, payload, createdBy: createdBy() });
    return {
      // Second text block too: some clients (Muse) read only text, not structuredContent.
      content: [
        { type: "text", text: "queued for clinician approval" },
        { type: "text", text: `approval_id: ${id}` },
      ],
      structuredContent: { status: "pending" as const, approval_id: id },
    };
  },
);

const { morningBrief } = await import("../lib/compliance/brief");

const briefItem = z.object({
  rule_id: z.string().nullable(),
  title: z.string(),
  due_on: z.string().nullable(),
  days_left: z.number().nullable(),
  urgency: z.string().nullable(),
  what_to_do: z.string().nullable(),
  you_must: z.string().nullable(),
  source: z.string().nullable(),
  needs_confirming: z.boolean(),
});

// Read-only: what the clinician needs to do this week, from the compliance calendar.
server.registerTool(
  "morning_brief",
  {
    title: "Morning brief: what needs you this week",
    description:
      "Answers 'What needs me this week?' for the clinician's practice: compliance deadlines due in the next 7 days " +
      "(license, CE, CAQH, taxes, filings), anything urgent just after, setup questions waiting, and dates Aeon still needs. " +
      "Each item says what to do and the part only she can do. Read-only; changes nothing.",
    outputSchema: {
      today: z.string(),
      this_week: z.array(briefItem),
      urgent_soon: z.array(briefItem),
      setup_questions: z.array(z.object({ rule_id: z.string().nullable(), title: z.string(), what_to_do: z.string().nullable() })),
      needs_dates: z.array(z.object({ title: z.string(), question: z.string() })),
      payer_dates: z.array(
        z.object({
          id: z.string(),
          payer: z.string(),
          kind: z.enum(["follow_up", "recredential"]),
          due_on: z.string(),
          days_left: z.number(),
          what: z.string(),
        }),
      ),
      is_sample: z.boolean(),
      summary: z.string(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async () => {
    const brief = await morningBrief();
    return { content: [{ type: "text", text: brief.summary }], structuredContent: brief };
  },
);

const actions = await import("../lib/compliance/actions");
const { recheckRules } = await import("../lib/compliance/recheck");
const { TOPICS } = await import("../lib/compliance/research");
const { ANSWERS } = await import("../lib/compliance/answers");

const text = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

// Long: a few minutes per topic. Queues one approval; saves nothing until she approves.
server.registerTool(
  "research_state_rules",
  {
    title: "Research this practice's state rules",
    description:
      "Muse researches the clinician's state rules (license renewal, CE, entity filing, state taxes, records, compacts; payroll and " +
      "employer rules once she has employees) on official sites with web search. Every rule must quote an official page it cites; " +
      "code drops anything it can't verify. The result waits in her approvals inbox as one item; nothing is saved until she approves. " +
      "Slow (about 1-2 minutes per topic): pass 1-3 topics per call. Refuses states whose rules already ship verified (Illinois).",
    inputSchema: {
      topics: z
        .array(z.enum(TOPICS.map((t) => t.id) as [string, ...string[]]))
        .max(4)
        .optional()
        .describe("Which topics to research this call. Omit for all relevant topics (slow)."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true, idempotentHint: false },
  },
  async ({ topics }) => text(await actions.runResearch(topics, createdBy())),
);

server.registerTool(
  "recheck_rules",
  {
    title: "Re-check researched rules",
    description:
      "Re-checks the state rules Muse researched that are due (quarterly), or all with force. Reads each source page first; " +
      "asks Muse only when a page can't be read. A rule whose quote is gone is flagged on her Deadlines page. " +
      "Never touches the rules that ship verified (federal, Illinois).",
    inputSchema: {
      force: z.boolean().optional().describe("Re-check every researched rule now, not just the ones due."),
      limit: z.number().int().min(1).max(50).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true, idempotentHint: true },
  },
  async ({ force, limit }) => text(await recheckRules({ force, limit, by: createdBy() })),
);

server.registerTool(
  "update_facts",
  {
    title: "Update practice facts",
    description:
      "Saves a fact about the practice that changes which deadlines apply or when, then rebuilds the calendar. Examples: " +
      "'I attested on CAQH today' -> caqh_last_attested_on; 'I hired my first employee' -> employee_count; " +
      "'my license expires June 30 2027' -> license_expires_on; '24 CE hours done' -> ce_hours_done. " +
      "Business facts only: never a client's name or any clinical detail.",
    inputSchema: actions.updatableFacts.shape,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
  },
  async (facts) => text(await actions.updateFacts(facts, createdBy())),
);

server.registerTool(
  "answer_setup",
  {
    title: "Answer a setup reminder",
    description:
      "Records her answer to a 'Did you set this up?' reminder (rule_id from morning_brief's setup_questions): " +
      "done (asked again when due), not_yet (asked again in 30 days) or not_applicable (hidden for a year).",
    inputSchema: {
      rule_id: z.string().regex(/^[a-z0-9_]+$/),
      answer: z.enum(ANSWERS),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
  },
  async ({ rule_id, answer }) => text(await actions.answerSetupByRule(rule_id, answer, createdBy())),
);

server.registerTool(
  "log_event",
  {
    title: "Start a deadline clock",
    description:
      "Starts a clock when something happens: a records request, a move, a new hire, a contractor, a text opt-out. " +
      "The deadline appears on her Deadlines page. Call without rule_id to list the clocks that apply to her. " +
      "Takes only a date: never a client's name or any detail about a client.",
    inputSchema: {
      rule_id: z.string().regex(/^[a-z0-9_]+$/).optional(),
      happened_on: isoDay.optional().describe("When it happened (default today)."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
  },
  async ({ rule_id, happened_on }) =>
    text(rule_id ? await actions.logEvent(rule_id, happened_on, createdBy()) : { clocks: await actions.listClocks() }),
);

const gfe = await import("../lib/gfe/store");

server.registerTool(
  "draft_gfe",
  {
    title: "Draft a Good Faith Estimate",
    description:
      "Drafts a Good Faith Estimate for a self-pay client (45 CFR 149.610) and queues it for her approval. " +
      "Prices come from her fee list; the due date counts the days her practice is open. " +
      "Takes no client details: never a name, birthday, contact detail or diagnosis. She adds those herself when she makes the PDF. " +
      "Approving marks it issued; nothing is sent. Returns the reference number and due date.",
    inputSchema: {
      basis: z.enum(["scheduled", "requested"]).describe("scheduled: a visit was booked; requested: the client asked for an estimate."),
      scheduled_on: isoDay.optional().describe("Booking date (scheduled)."),
      service_on: isoDay.optional().describe("First visit date (scheduled)."),
      requested_on: isoDay.optional().describe("Date the client asked (requested)."),
      service_kind: z.enum(["individual", "couples", "family", "group"]),
      lines: z
        .array(
          z.object({
            code: z.string().regex(/^[A-Z0-9]{5}$/).describe("A CPT code on her fee list, e.g. 90837."),
            quantity: z.number().int().min(1).max(366),
            location: z.enum(["office", "telehealth", "either"]),
          }),
        )
        .min(1)
        .max(20),
      frequency: z.enum(["weekly", "every_2_weeks", "monthly"]).optional().describe("For recurring care; scope is capped at 12 months."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: false },
  },
  async (input) => {
    const r = await gfe.draftEstimate(input, { createdBy: createdBy() });
    return text({ reference: r.reference, due_on: r.dueOn, approval_id: r.approvalId, next: "She approves it in Approvals, then makes the PDF on the Paperwork page." });
  },
);

const cred = await import("../lib/credentialing/store");
const credActions = await import("../lib/credentialing/actions");

server.registerTool(
  "get_credentialing",
  {
    title: "Read her credentialing profile",
    description:
      "Her credentialing profile in CAQH ProView order: identity, education, license (type, state, board; never a number), NPI, " +
      "tax ID, malpractice, practice location, work history and documents with expiry dates, plus the last NPPES check. Read-only.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
  },
  async () => {
    const profile = await cred.loadCredentialingProfile();
    return text(profile ? { profile, sections: cred.sectionValues(profile) } : { profile: null, next: "Ask her for her details and save them with update_credentialing." });
  },
);

server.registerTool(
  "update_credentialing",
  {
    title: "Update one section of her credentialing profile",
    description:
      "Saves one section of her credentialing profile, replacing that section. Read the current values with get_credentialing first and send the whole section back changed. " +
      "Sections and shapes: identity {name, credential, practice_name, email, phone}; education [{degree, school, graduated}]; " +
      "license {type, state, board} (never a license number); npi {npi, npi_type, taxonomy}; tin {tin: '12-3456789'}; " +
      "malpractice {carrier, per_claim, aggregate, expires_on}; practice_location {name, street, city, state, zip, phone, telehealth}; " +
      "work_history {jobs: [{employer, role, from, to}], gaps: [{from, to, reason}]}; documents [{id, label, upload, on_file, expires_on}]. " +
      "Example: 'my malpractice renewed through Dec 1 2027' -> malpractice with expires_on 2027-12-01, and the malpractice document's expires_on too. Her own business details only.",
    inputSchema: {
      section: z.enum(["identity", "education", "license", "npi", "tin", "malpractice", "practice_location", "work_history", "documents"]),
      value: z.any().describe("The whole section, in the shape above."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
  },
  async ({ section, value }) => {
    const profile = await cred.updateCredentialingSection(section, value, createdBy());
    const caqh = await credActions.currentCaqhPrep();
    return text({ saved: section, sections: cred.sectionValues(profile), caqh_items_open: caqh?.prep.items.filter((i) => !i.done).map((i) => i.label) });
  },
);

server.registerTool(
  "caqh_prep",
  {
    title: "Get her ready to re-attest on CAQH",
    description:
      "What to fix before she re-attests on CAQH (DataSpring): the re-attest date from her state's rule (Illinois 180 days, else 120), " +
      "missing or expiring documents, work-history gaps, disclosure questions. Ends with the step only she can do: log in and click Attest. Read-only.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
  },
  async () => text((await credActions.currentCaqhPrep()) ?? { prep: null, next: "Her credentialing profile isn't set up yet." }),
);

server.registerTool(
  "check_npi",
  {
    title: "Check her NPI in NPPES",
    description: "Looks up her own NPI in the public NPPES registry and saves whether it was found and whether the taxonomy matches her profile.",
    inputSchema: {},
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true, idempotentHint: true },
  },
  async () => text(await cred.checkNpiInRegistry()),
);

const payers = await import("../lib/payers/store");
const cms855i = await import("../lib/payers/cms855i");

server.registerTool(
  "fill_payer_form",
  {
    title: "Prepare a payer enrollment form",
    description:
      "Prepares Medicare's CMS-855I (version 05/23) from her credentialing profile and returns what was filled and what only she can complete. " +
      "Counselors and MFTs get 'Undefined Non-Physician Practitioner Specialty' with MHC or MFT written in, per CMS's May 2024 FAQ. " +
      "It never fills her SSN, date of birth, license number, the legal questions, payment details or the signature, and it never submits. " +
      "She downloads it on Paperwork > Insurance, or applies online in PECOS (faster, and it lists MFT and MHC). Also adds a Medicare row to her applications if missing.",
    inputSchema: { form: z.enum(["cms855i"]) },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
  },
  async () => {
    const profile = await cred.loadCredentialingProfile();
    if (!profile) return text({ error: "Her credentialing profile isn't set up yet. Fill it in first (update_credentialing)." });
    const r = await cms855i.fillCms855i(profile);
    const apps = await payers.listPayerApplications();
    if (!apps.some((a) => a.form === "cms855i")) await payers.savePayerApplication({ payer: "Medicare", form: "cms855i", status: "preparing" }, createdBy());
    return text({
      form: `CMS-855I (${cms855i.CMS855I_VERSION})`,
      filled: r.filled,
      left_for_her: r.leftForYou,
      download: "Paperwork > Insurance > Download the prepared CMS-855I",
      faster_route: "PECOS (pecos.cms.hhs.gov) lists MFT and MHC as specialties and is usually faster than paper.",
      is_sample: profile.isSample,
    });
  },
);

server.registerTool(
  "list_payer_applications",
  {
    title: "List her insurance applications",
    description: "Every payer she's applying to or enrolled with: status, applied, follow-up, approved and recredential dates. Read-only.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
  },
  async () => text({ applications: await payers.listPayerApplications() }),
);

server.registerTool(
  "update_payer_application",
  {
    title: "Add or update an insurance application",
    description:
      "Adds a payer (no id) or updates one (with id from list_payer_applications). Status: preparing, applied, pending, approved, denied, withdrawn. " +
      "Applied with no follow_up_on sets a follow-up 30 days out; approved with no recredential_on sets 36 months out. " +
      "Example: 'I sent my BCBSIL application today' -> {payer: 'BCBSIL', status: 'applied'}. Never a license number or client detail.",
    inputSchema: {
      id: z.string().uuid().optional(),
      payer: z.string().min(2).max(120),
      form: z.enum(["cms855i"]).optional(),
      status: z.enum(["preparing", "applied", "pending", "approved", "denied", "withdrawn"]),
      applied_on: isoDay.optional(),
      follow_up_on: isoDay.optional(),
      approved_on: isoDay.optional(),
      effective_on: isoDay.optional(),
      recredential_on: isoDay.optional(),
      reference: z.string().max(60).optional(),
      notes: z.string().max(500).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: false },
  },
  async (input) => text(await payers.savePayerApplication(input, createdBy())),
);

await server.connect(new StdioServerTransport());
