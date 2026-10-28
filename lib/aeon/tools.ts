// Aeon's tools, defined once (AGENTS.md > chat-first: every feature reachable by
// talking to Aeon). mcp/server.ts registers every tool here, and the chat agent
// (lib/aeon/agent.ts) offers the same list to muse-spark-1.3, so a tool gives
// the same result either way. runTool() is the only way to call one: it checks
// the input, enforces the Vercel demo's view-only rule, and passes every result
// through the sensitive-info guard before any model or MCP client sees it.
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { APPROVAL_KINDS } from "../approval-kinds";
import { queueApproval } from "../approvals";
import { ANSWERS } from "../compliance/answers";
import * as actions from "../compliance/actions";
import { morningBrief } from "../compliance/brief";
import { recheckRules } from "../compliance/recheck";
import { TOPICS } from "../compliance/research";
import * as credActions from "../credentialing/actions";
import * as cred from "../credentialing/store";
import { isDryRun } from "../env";
import { money } from "../gfe/build";
import * as gfe from "../gfe/store";
import { CPT, MODIFIERS, POS } from "../superbill/codes";
import * as superbill from "../superbill/store";
import * as cms855i from "../payers/cms855i";
import * as payers from "../payers/store";
import { guard, WITHHELD } from "./guard";
import { forget, MEMORY_KINDS, MemoryRefused, recentChanges, remember } from "./memory";

export type ToolContext = {
  /** Who is calling, for created_by and audit rows: "mcp:<client>" or "chat:<conversation id>". */
  by: string;
  /** The Vercel demo copy without ADMIN_PASSWORD: tools that change data refuse. */
  viewOnly?: boolean;
};

export type ToolResult = {
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

export type AeonTool = {
  name: string;
  title: string;
  description: string;
  input: z.ZodRawShape;
  output?: z.ZodRawShape;
  annotations: { readOnlyHint?: boolean; destructiveHint?: boolean; openWorldHint?: boolean; idempotentHint?: boolean };
  /** What the chat shows after it runs, in her words: "Checked your deadlines". */
  label: string;
  /** Changes saved data. Refused on the Vercel demo copy. Drafts that only queue an approval don't count. */
  changesData: boolean;
  run: (input: never, ctx: ToolContext) => Promise<ToolResult>;
};

const text = (value: unknown): ToolResult => ({ content: [{ type: "text", text: JSON.stringify(value, null, 2) }] });
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

const MAX_JSON_BYTES = 20_000;
const jsonObject = z
  .record(z.unknown())
  .refine((v) => Buffer.byteLength(JSON.stringify(v)) <= MAX_JSON_BYTES, {
    message: `Must be at most ${MAX_JSON_BYTES / 1000} KB as JSON.`,
  });

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

// Typed per tool, stored loosely: run() is only reached through runTool(), which parses the input first.
function tool<I extends z.ZodRawShape>(
  def: Omit<AeonTool, "run" | "input"> & { input: I; run: (input: z.infer<z.ZodObject<I>>, ctx: ToolContext) => Promise<ToolResult> },
): AeonTool {
  return def as unknown as AeonTool;
}

export const TOOLS: AeonTool[] = [
  tool({
    name: "status",
    title: "Practice-OS status",
    description: "Reports whether Practice-OS is running and whether it is in dry-run mode.",
    input: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
    label: "Checked Practice-OS is running",
    changesData: false,
    run: async () => ({ content: [{ type: "text", text: JSON.stringify({ ok: true, dryRun: isDryRun() }) }] }),
  }),

  // AGENTS.md > Approvals: agents and tools only INSERT pending approvals.
  // Nothing is sent, posted or booked until the clinician approves it in the app.
  tool({
    name: "queue_approval",
    title: "Queue for clinician approval",
    description:
      "Adds a draft action (a letter, post, text reply or booking) to the clinician's approvals inbox as pending. " +
      "Nothing is sent, posted or booked until she approves it in Practice-OS.",
    input: {
      kind: z.enum(APPROVAL_KINDS).describe("What kind of action this is."),
      title: z.string().trim().min(1).max(200).describe("A short line the clinician sees in her inbox."),
      preview: jsonObject.optional().describe("What the clinician sees before approving, e.g. { body: '...' }."),
      payload: jsonObject.optional().describe("What the executor needs to carry it out after approval."),
    },
    output: { status: z.literal("pending"), approval_id: z.string().uuid() },
    annotations: { destructiveHint: false, openWorldHint: false, idempotentHint: false },
    label: "Put a draft in your approvals",
    changesData: false,
    run: async ({ kind, title, preview, payload }, ctx) => {
      const id = await queueApproval({ kind, title, preview, payload, createdBy: ctx.by });
      return {
        // Second text block too: some clients (Muse) read only text, not structuredContent.
        content: [
          { type: "text", text: "queued for clinician approval" },
          { type: "text", text: `approval_id: ${id}` },
        ],
        structuredContent: { status: "pending" as const, approval_id: id },
      };
    },
  }),

  // Read-only: what the clinician needs to do this week, from the compliance calendar.
  tool({
    name: "morning_brief",
    title: "Morning brief: what needs you this week",
    description:
      "Answers 'What needs me this week?' for the clinician's practice: compliance deadlines due in the next 7 days " +
      "(license, CE, CAQH, taxes, filings), anything urgent just after, setup questions waiting, and dates Aeon still needs. " +
      "Each item says what to do and the part only she can do. Read-only; changes nothing.",
    input: {},
    output: {
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
    label: "Checked your deadlines",
    changesData: false,
    run: async () => {
      const brief = await morningBrief();
      return { content: [{ type: "text", text: brief.summary }], structuredContent: brief };
    },
  }),

  // Long: a few minutes per topic. Queues one approval; saves nothing until she approves.
  tool({
    name: "research_state_rules",
    title: "Research this practice's state rules",
    description:
      "Muse researches the clinician's state rules (license renewal, CE, entity filing, state taxes, records, compacts; payroll and " +
      "employer rules once she has employees) on official sites with web search. Every rule must quote an official page it cites; " +
      "code drops anything it can't verify. The result waits in her approvals inbox as one item; nothing is saved until she approves. " +
      "Slow (about 1-2 minutes per topic): pass 1-3 topics per call. Refuses states whose rules already ship verified (Illinois).",
    input: {
      topics: z
        .array(z.enum(TOPICS.map((t) => t.id) as [string, ...string[]]))
        .max(4)
        .optional()
        .describe("Which topics to research this call. Omit for all relevant topics (slow)."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true, idempotentHint: false },
    label: "Researched your state's rules",
    changesData: true,
    run: async ({ topics }, ctx) => text(await actions.runResearch(topics, ctx.by)),
  }),

  tool({
    name: "recheck_rules",
    title: "Re-check researched rules",
    description:
      "Re-checks the state rules Muse researched that are due (quarterly), or all with force. Reads each source page first; " +
      "asks Muse only when a page can't be read. A rule whose quote is gone is flagged on her Deadlines page. " +
      "Never touches the rules that ship verified (federal, Illinois).",
    input: {
      force: z.boolean().optional().describe("Re-check every researched rule now, not just the ones due."),
      limit: z.number().int().min(1).max(50).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true, idempotentHint: true },
    label: "Re-checked your researched rules",
    changesData: true,
    run: async ({ force, limit }, ctx) => text(await recheckRules({ force, limit, by: ctx.by })),
  }),

  tool({
    name: "update_facts",
    title: "Update practice facts",
    description:
      "Saves a fact about the practice that changes which deadlines apply or when, then rebuilds the calendar. Examples: " +
      "'I attested on CAQH today' -> caqh_last_attested_on; 'I hired my first employee' -> employee_count; " +
      "'my license expires June 30 2027' -> license_expires_on; '24 CE hours done' -> ce_hours_done. " +
      "Business facts only: never a client's name or any clinical detail.",
    input: actions.updatableFacts.shape,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    label: "Updated your practice facts",
    changesData: true,
    run: async (facts, ctx) => text(await actions.updateFacts(facts, ctx.by)),
  }),

  tool({
    name: "answer_setup",
    title: "Answer a setup reminder",
    description:
      "Records her answer to a 'Did you set this up?' reminder (rule_id from morning_brief's setup_questions): " +
      "done (asked again when due), not_yet (asked again in 30 days) or not_applicable (hidden for a year).",
    input: {
      rule_id: z.string().regex(/^[a-z0-9_]+$/),
      answer: z.enum(ANSWERS),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    label: "Saved your setup answer",
    changesData: true,
    run: async ({ rule_id, answer }, ctx) => text(await actions.answerSetupByRule(rule_id, answer, ctx.by)),
  }),

  tool({
    name: "log_event",
    title: "Start a deadline clock",
    description:
      "Starts a clock when something happens: a records request, a move, a new hire, a contractor, a text opt-out. " +
      "The deadline appears on her Deadlines page. Call without rule_id to list the clocks that apply to her. " +
      "Takes only a date: never a client's name or any detail about a client.",
    input: {
      rule_id: z.string().regex(/^[a-z0-9_]+$/).optional(),
      happened_on: isoDay.optional().describe("When it happened (default today)."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    label: "Started a deadline clock",
    changesData: true,
    run: async ({ rule_id, happened_on }, ctx) =>
      text(rule_id ? await actions.logEvent(rule_id, happened_on, ctx.by) : { clocks: await actions.listClocks() }),
  }),

  tool({
    name: "draft_gfe",
    title: "Draft a Good Faith Estimate",
    description:
      "Drafts a Good Faith Estimate for a self-pay client (45 CFR 149.610) and queues it for her approval. " +
      "Prices come from her fee list; the due date counts the days her practice is open. " +
      "Takes no client details: never a name, birthday, contact detail or diagnosis. She adds those herself when she makes the PDF. " +
      "Approving marks it issued; nothing is sent. Returns the reference number and due date.",
    input: {
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
    label: "Drafted a Good Faith Estimate",
    changesData: false,
    run: async (input, ctx) => {
      const r = await gfe.draftEstimate(input, { createdBy: ctx.by });
      return text({ reference: r.reference, due_on: r.dueOn, approval_id: r.approvalId, next: "She approves it in Approvals, then makes the PDF on the Paperwork page." });
    },
  }),

  tool({
    name: "draft_superbill",
    title: "Prepare a superbill",
    description:
      "Prepares a superbill (a statement a self-pay or out-of-network client sends to their insurer) and saves it by reference (SB-2026-0001). " +
      "Fill each line from what she says: the date, the CPT code, place of service and modifier. Pick the code from session length: " +
      "90832 for 16-37 minutes, 90834 for 38-52, 90837 for 53 or more; 90791 for a first (intake) session. " +
      "Place of service: 11 office, 10 telehealth with the client at home, 02 telehealth elsewhere; telehealth takes modifier 95 (video) or 93 (audio only), office visits take none. " +
      "Fees default to her fee list. Takes no client details: never a name, birthday, address or diagnosis. " +
      "The PDF leaves those as blank boxes she fills in herself, then she gives it to the client her own way; Aeon never sends it.",
    input: {
      lines: z
        .array(
          z.object({
            date_of_service: isoDay.describe("The session date; must be in the past."),
            cpt: z.enum(Object.keys(CPT) as [keyof typeof CPT]).describe("CPT code from the list."),
            modifier: z.enum(Object.keys(MODIFIERS) as [keyof typeof MODIFIERS]).nullable().optional().describe("Telehealth modifier, or null for an office visit."),
            units: z.number().int().min(1).max(8).optional().describe("Leave out: 1. Only 90840 can be more."),
            cents: z.number().int().min(0).optional().describe("Fee per session in cents if she named one; otherwise her fee list is used."),
            pos: z.enum(Object.keys(POS) as [keyof typeof POS]).describe("Place of service."),
            dx_pointers: z.array(z.enum(["A", "B", "C", "D"])).min(1).max(4).optional().describe("Which of her diagnosis boxes each line points to; default A."),
          }).strict(),
        )
        .min(1)
        .max(31),
      paid_cents: z.number().int().min(0).optional().describe("What the client already paid, in cents."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: false },
    label: "Prepared a superbill",
    changesData: true,
    run: async (input, ctx) => {
      const sb = await superbill.createSuperbill(input, { createdBy: ctx.by });
      return text({
        reference: sb.reference,
        lines: sb.lines.map(superbill.describeLine),
        total: money(sb.total_cents),
        paid: money(sb.paid_cents),
        balance: money(sb.total_cents - sb.paid_cents),
        next: "Tell her: I filled in what I know. Open it on Paperwork > Superbills, type the client's name, birth date, address and diagnosis codes into the blank boxes, then give it to them your own way.",
      });
    },
  }),

  tool({
    name: "get_credentialing",
    title: "Read her credentialing profile",
    description:
      "Her credentialing profile in CAQH ProView order: identity, education, license (type, state, board; never a number), NPI, " +
      "tax ID, malpractice, practice location, work history and documents with expiry dates, plus the last NPPES check. Read-only.",
    input: {},
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    label: "Read your credentialing profile",
    changesData: false,
    run: async () => {
      const profile = await cred.loadCredentialingProfile();
      return text(profile ? { profile, sections: cred.sectionValues(profile) } : { profile: null, next: "Ask her for her details and save them with update_credentialing." });
    },
  }),

  tool({
    name: "update_credentialing",
    title: "Update one section of her credentialing profile",
    description:
      "Saves one section of her credentialing profile, replacing that section. Read the current values with get_credentialing first and send the whole section back changed. " +
      "Sections and shapes: identity {name, credential, practice_name, email, phone}; education [{degree, school, graduated}]; " +
      "license {type, state, board} (never a license number); npi {npi, npi_type, taxonomy}; tin {tin: '12-3456789'}; " +
      "malpractice {carrier, per_claim, aggregate, expires_on}; practice_location {name, street, city, state, zip, phone, telehealth}; " +
      "work_history {jobs: [{employer, role, from, to}], gaps: [{from, to, reason}]}; documents [{id, label, upload, on_file, expires_on}]. " +
      "Example: 'my malpractice renewed through Dec 1 2027' -> malpractice with expires_on 2027-12-01, and the malpractice document's expires_on too. Her own business details only.",
    input: {
      section: z.enum(["identity", "education", "license", "npi", "tin", "malpractice", "practice_location", "work_history", "documents"]),
      value: z.any().describe("The whole section, in the shape above."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    label: "Updated your credentialing profile",
    changesData: true,
    run: async ({ section, value }, ctx) => {
      const profile = await cred.updateCredentialingSection(section, value, ctx.by);
      const caqh = await credActions.currentCaqhPrep();
      return text({ saved: section, sections: cred.sectionValues(profile), caqh_items_open: caqh?.prep.items.filter((i) => !i.done).map((i) => i.label) });
    },
  }),

  tool({
    name: "caqh_prep",
    title: "Get her ready to re-attest on CAQH",
    description:
      "What to fix before she re-attests on CAQH (DataSpring): the re-attest date from her state's rule (Illinois 180 days, else 120), " +
      "missing or expiring documents, work-history gaps, disclosure questions. Ends with the step only she can do: log in and click Attest. Read-only.",
    input: {},
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    label: "Checked what CAQH needs from you",
    changesData: false,
    run: async () => text((await credActions.currentCaqhPrep()) ?? { prep: null, next: "Her credentialing profile isn't set up yet." }),
  }),

  tool({
    name: "check_npi",
    title: "Check her NPI in NPPES",
    description: "Looks up her own NPI in the public NPPES registry and saves whether it was found and whether the taxonomy matches her profile.",
    input: {},
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true, idempotentHint: true },
    label: "Checked your NPI in the national registry",
    changesData: true,
    run: async () => text(await cred.checkNpiInRegistry()),
  }),

  // Insurance: prepare a payer's enrollment form and track each application. She signs and submits.
  tool({
    name: "fill_payer_form",
    title: "Prepare a payer enrollment form",
    description:
      "Prepares Medicare's CMS-855I (version 05/23) from her credentialing profile and returns what was filled and what only she can complete. " +
      "Counselors and MFTs get 'Undefined Non-Physician Practitioner Specialty' with MHC or MFT written in, per CMS's May 2024 FAQ. " +
      "It never fills her SSN, date of birth, license number, the legal questions, payment details or the signature, and it never submits. " +
      "She downloads it on Paperwork > Insurance, or applies online in PECOS (faster, and it lists MFT and MHC). Also adds a Medicare row to her applications if missing.",
    input: { form: z.enum(["cms855i"]) },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    label: "Prepared your Medicare enrollment form",
    changesData: true,
    run: async (_input, ctx) => {
      const profile = await cred.loadCredentialingProfile();
      if (!profile) return text({ error: "Her credentialing profile isn't set up yet. Fill it in first (update_credentialing)." });
      const r = await cms855i.fillCms855i(profile);
      const apps = await payers.listPayerApplications();
      if (!apps.some((a) => a.form === "cms855i")) await payers.savePayerApplication({ payer: "Medicare", form: "cms855i", status: "preparing" }, ctx.by);
      return text({
        form: `CMS-855I (${cms855i.CMS855I_VERSION})`,
        filled: r.filled,
        left_for_her: r.leftForYou,
        download: "Paperwork > Insurance > Download the prepared CMS-855I",
        faster_route: "PECOS (pecos.cms.hhs.gov) lists MFT and MHC as specialties and is usually faster than paper.",
        is_sample: profile.isSample,
      });
    },
  }),

  tool({
    name: "list_payer_applications",
    title: "List her insurance applications",
    description: "Every payer she's applying to or enrolled with: status, applied, follow-up, approved and recredential dates. Read-only.",
    input: {},
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    label: "Checked your insurance applications",
    changesData: false,
    run: async () => text({ applications: await payers.listPayerApplications() }),
  }),

  tool({
    name: "update_payer_application",
    title: "Add or update an insurance application",
    description:
      "Adds a payer (no id) or updates one (with id from list_payer_applications). Status: preparing, applied, pending, approved, denied, withdrawn. " +
      "Applied with no follow_up_on sets a follow-up 30 days out; approved with no recredential_on sets 36 months out. " +
      "Example: 'I sent my BCBSIL application today' -> {payer: 'BCBSIL', status: 'applied'}. Never a license number or client detail.",
    input: {
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
    label: "Updated your insurance applications",
    changesData: true,
    run: async (input, ctx) => text(await payers.savePayerApplication(input, ctx.by)),
  }),

  // AGENTS.md > Aeon's memory: Aeon saves what it learns through remember, each one audited.
  tool({
    name: "remember",
    title: "Remember something about the practice",
    description:
      "Saves one thing Aeon should remember about this practice for every future conversation: a preference ('prefers Tuesday consults'), " +
      "a decision ('does not take Medicaid'), a fact ('fee for 90837 is $175') or what worked ('superbill posts got the most saves'). " +
      "One short sentence in plain words. Practice business only: never a client's name, birth date, contact detail, diagnosis or anything clinical " +
      "(those are refused). When it updates an older memory, pass that memory's id as replaces.",
    input: {
      kind: z.enum(MEMORY_KINDS),
      text: z.string().trim().min(3).max(500),
      replaces: z.string().uuid().optional().describe("The id of an older memory this one replaces."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    label: "Saved to memory",
    changesData: true,
    run: async ({ kind, text: memoryText, replaces }, ctx) => {
      try {
        const { memory, created } = await remember({ kind, text: memoryText, replaces }, { actor: "aeon", source: ctx.by });
        return text({ saved: created, already_remembered: !created, id: memory.id, kind: memory.kind, text: memory.text });
      } catch (err) {
        if (err instanceof MemoryRefused) return { content: [{ type: "text", text: `Not saved. ${err.message}` }], isError: true };
        throw err;
      }
    },
  }),

  tool({
    name: "recent_memory_changes",
    title: "What Aeon remembered lately",
    description:
      "Lists what Aeon added to, changed in, retired from or refused for its memory about this practice in the last few days, newest first. " +
      "Use it when she asks what you remembered or learned. Refused ones show only their kind, never the text.",
    input: { days: z.number().int().min(1).max(90).default(7) },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    label: "Checked what I remembered",
    changesData: false,
    run: async ({ days }) => {
      const changes = await recentChanges(days);
      return text({
        days,
        changes: changes.map((c) => ({ on: c.at.toISOString().slice(0, 10), what: c.action, kind: c.kind, topic: c.topic, text: c.text })),
      });
    },
  }),

  tool({
    name: "forget",
    title: "Forget a memory",
    description: "Stops Aeon using one saved memory (by its id). She can still see it, and delete it for good, on the Memory page.",
    input: { id: z.string().uuid() },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    label: "Removed from memory",
    changesData: true,
    run: async ({ id }, ctx) => {
      const row = await forget(id, { actor: "aeon", source: ctx.by });
      return text(row ? { forgotten: true, id } : { forgotten: false, id, reason: "No active memory with that id." });
    },
  }),
];

export const TOOLS_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

const VIEW_ONLY =
  "This is the view-only demo copy of Practice-OS, so I can't change saved data here. On her own computer this works.";

/** Guards every text block and the structured result. A blocked result is replaced, never passed on. */
export async function guardResult(result: ToolResult): Promise<ToolResult> {
  const content: ToolResult["content"] = [];
  for (const block of result.content) {
    const check = await guard(block.text, "tool_result");
    content.push({ type: "text", text: check.ok ? check.text : WITHHELD });
  }
  if (!result.structuredContent) return { ...result, content };
  const raw = JSON.stringify(result.structuredContent);
  const check = await guard(raw, "tool_result");
  if (!check.ok) return { content: [{ type: "text", text: WITHHELD }], isError: true };
  return { ...result, content, structuredContent: check.text === raw ? result.structuredContent : JSON.parse(check.text) };
}

/** The one way to call a tool, from MCP or the chat. */
export async function runTool(name: string, args: unknown, ctx: ToolContext): Promise<ToolResult> {
  const tool = TOOLS_BY_NAME.get(name);
  if (!tool) return { content: [{ type: "text", text: `No tool named ${name}.` }], isError: true };
  if (ctx.viewOnly && tool.changesData) return { content: [{ type: "text", text: VIEW_ONLY }], isError: true };
  const parsed = z.object(tool.input).safeParse(args ?? {});
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
    return { content: [{ type: "text", text: `Invalid input for ${name}: ${problems}` }], isError: true };
  }
  return guardResult(await tool.run(parsed.data as never, ctx));
}

/** The tool list in Chat Completions shape (cookbook 03_tool_calling.ipynb). */
export function chatTools(names?: string[]) {
  return TOOLS.filter((t) => !names || names.includes(t.name)).map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: zodToJsonSchema(z.object(t.input), { $refStrategy: "none", target: "openApi3" }) as Record<string, unknown>,
    },
  }));
}
