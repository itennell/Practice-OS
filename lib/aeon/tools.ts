// Aeon's tools, defined once (AGENTS.md > chat-first: every feature reachable by
// talking to Aeon). mcp/server.ts registers every tool here, and the chat agent
// (lib/aeon/agent.ts) offers the same list to muse-spark-1.3, so a tool gives
// the same result either way. runTool() is the only way to call one: it checks
// the input, enforces the Vercel demo's view-only rule, and passes every result
// through the sensitive-info guard before any model or MCP client sees it.
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { APPROVAL_KINDS, type ApprovalKind } from "../approval-kinds";
import { withOrigin, type ApprovalMode } from "../approval-policy";
import { queueApproval } from "../approvals";
import { ANSWERS } from "../compliance/answers";
import * as actions from "../compliance/actions";
import { morningBrief } from "../compliance/brief";
import { recheckRules } from "../compliance/recheck";
import { TOPICS } from "../compliance/research";
import * as credActions from "../credentialing/actions";
import * as cred from "../credentialing/store";
import { db } from "../db";
import { isDryRun } from "../env";
import { money } from "../gfe/build";
import * as gfe from "../gfe/store";
import { putReleaseDraft } from "../release/drafts";
import { checkReleaseFields } from "../release/fields";
import { practiceToday } from "../compliance/store";
import { CPT, MODIFIERS, POS } from "../superbill/codes";
import * as superbill from "../superbill/store";
import * as cms855i from "../payers/cms855i";
import * as payers from "../payers/store";
import * as instagram from "../instagram/store";
import * as coach from "../instagram/coach";
import type { ChatFn } from "../instagram/critic";
import { ACCOUNT_STEPS } from "../instagram/onboarding";
import { SPECIALTIES, type SpecialtyId } from "../referrals/nppes";
import { draftOutreach } from "../referrals/outreach";
import { DEFAULT_SPECIALTIES, getReferralSettings } from "../referrals/settings";
import { findReferralSources, interleave, listSources, moveSource, STAGE_LABEL, STAGES } from "../referrals/store";
import * as documents from "../documents";
import { DOCUMENT_KINDS, forModel, type DocumentCard } from "../documents/card";
import { guard, WITHHELD } from "./guard";
import { forget, MEMORY_KINDS, MemoryRefused, recentChanges, remember } from "./memory";

export type ToolContext = {
  /** Who is calling, for created_by and audit rows: "mcp:<client>" or "chat:<conversation id>". */
  by: string;
  /** The Vercel demo copy without ADMIN_PASSWORD: tools that change data refuse. */
  viewOnly?: boolean;
  /** How much Aeon may do on its own (lib/approval-policy.ts). Missing: tools run and nothing is auto-approved, as before modes. */
  mode?: ApprovalMode;
  /** She already approved this exact call (the aeon_action executor). */
  approved?: boolean;
  /** The model call to use inside tools that write with Muse (Instagram): the chat's own, so a recorded conversation replays end to end. */
  chat?: ChatFn;
};

/** aeon_action is queued only by runTool itself in Manual mode, never by an agent. */
const QUEUEABLE_KINDS = APPROVAL_KINDS.filter((k) => k !== "aeon_action") as [Exclude<ApprovalKind, "aeon_action">, ...Exclude<ApprovalKind, "aeon_action">[]];

/**
 * Saving or forgetting a memory never waits for her tap, in any mode. Nor do the
 * Instagram writers: they save ideas or drafts that wait for her approval anyway.
 * They still count as changes, so the view-only demo copy refuses them (no writes, no Muse).
 */
const ALWAYS_RUNS = new Set(["remember", "forget", "post_ideas", "weekly_plan", "draft_post", "plan_instagram_week", "draft_instagram_post"]);

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
  /** Left out of the chat's tool list (MCP only): the chat box has its own way in. */
  mcpOnly?: boolean;
  /** What the chat shows after it runs, in her words: "Checked your deadlines". */
  label: string;
  /** Changes saved data. Refused on the Vercel demo copy. Drafts that only queue an approval don't count. A function decides per call. */
  changesData: boolean | ((input: never) => boolean);
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

// Inputs shared by the single-purpose tools and create_document.
const gfeInput = {
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
};

const superbillInput = {
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
};

const releaseInput = {
  recipient: z.string().max(160).optional().describe("The person or agency receiving the information, e.g. 'Dr. Lee, primary care, Northside Clinic'."),
  recipient_address: z.string().max(200).optional().describe("Their address, phone or fax, if she gave it."),
  purpose: z.string().max(300).optional().describe("Why, e.g. 'coordinate care with the primary care doctor'."),
  information: z.string().max(400).optional().describe("Exactly what to release, e.g. 'dates of attendance and a treatment summary'."),
  expires_on: isoDay.describe("The calendar date the consent ends. Required."),
};

// What a document tool hands back: what Muse reads (the cards in short, plus what to
// tell her) and the full cards in structuredContent, which the chat draws.
function withCards(said: Record<string, unknown>, cards: DocumentCard[]): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify({ ...said, documents: cards.map(forModel) }, null, 2) }],
    structuredContent: { documents: cards },
  };
}

const OPEN_CARD = "Her card in the chat opens it, already filled in; don't name a page.";

async function makeGfe(input: z.infer<z.ZodObject<typeof gfeInput>>, ctx: ToolContext): Promise<ToolResult> {
  // It saves an estimate row and an approval, so the view-only demo copy refuses it like any change.
  if (ctx.viewOnly) return { content: [{ type: "text", text: VIEW_ONLY }], isError: true };
  const r = await gfe.draftEstimate(input, { createdBy: ctx.by });
  const [row, today] = await Promise.all([gfe.getEstimate(r.id), practiceToday()]);
  return withCards(
    { reference: r.reference, due_on: r.dueOn, approval_id: r.approvalId, next: `She approves it in Approvals, then types the client's details to make the PDF. ${OPEN_CARD}` },
    row ? [documents.gfeCard(row, today)] : [],
  );
}

async function makeSuperbill(input: z.infer<z.ZodObject<typeof superbillInput>>, ctx: ToolContext): Promise<ToolResult> {
  const sb = await superbill.createSuperbill(input, { createdBy: ctx.by });
  return withCards(
    {
      reference: sb.reference,
      lines: sb.lines.map(superbill.describeLine),
      total: money(sb.total_cents),
      paid: money(sb.paid_cents),
      balance: money(sb.total_cents - sb.paid_cents),
      next: `Tell her: I filled in what I know. Download it from the card, type the client's name, birth date, address and diagnosis codes into the blank boxes, then give it to them your own way. ${OPEN_CARD}`,
    },
    [documents.superbillCard(sb)],
  );
}

async function makeRelease(input: z.infer<z.ZodObject<typeof releaseInput>>): Promise<ToolResult> {
  try {
    const fields = checkReleaseFields(input, await practiceToday());
    const draft = putReleaseDraft(fields);
    const profile = await cred.loadCredentialingProfile();
    const filled = Object.entries(fields).filter(([, v]) => v).map(([k]) => k);
    return withCards(
      {
        // Kept for one release so outside MCP clients that read `open` keep working; the card has the same link.
        open: `/admin?panel=release&draft=${draft}`,
        filled,
        left_for_her: ["client name", "client date of birth", ...["recipient", "purpose", "information"].filter((k) => !filled.includes(k)), "signatures"],
        next: `Tell her: I filled in what I know. Download the PDF from the card, type the client's name and birth date, and have it signed. Keep a copy in the client's record. ${OPEN_CARD}`,
      },
      [documents.releaseDraftCard(draft, fields, profile?.isSample ?? false)],
    );
  } catch (err) {
    return { content: [{ type: "text", text: err instanceof Error ? err.message : "Couldn't fill it." }], isError: true };
  }
}

async function makeCms855i(ctx: ToolContext): Promise<ToolResult> {
  const profile = await cred.loadCredentialingProfile();
  if (!profile) return text({ error: "Her credentialing profile isn't set up yet. Fill it in first (update_credentialing)." });
  const r = await cms855i.fillCms855i(profile);
  const apps = await payers.listPayerApplications();
  if (!apps.some((a) => a.form === "cms855i")) await payers.savePayerApplication({ payer: "Medicare", form: "cms855i", status: "preparing" }, ctx.by);
  return withCards(
    {
      form: `CMS-855I (${cms855i.CMS855I_VERSION})`,
      filled: r.filled,
      left_for_her: r.leftForYou,
      // Kept for one release for outside MCP clients; the card has the same link.
      download: "/api/payers/cms855i",
      faster_route: "PECOS (pecos.cms.hhs.gov) lists MFT and MHC as specialties and is usually faster than paper.",
      next: `She downloads it from the card, finishes what's left, signs and submits it herself. ${OPEN_CARD}`,
      is_sample: profile.isSample,
    },
    [documents.cms855iCard(profile)],
  );
}

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
      "Nothing is sent, posted or booked until she approves it in Practice-OS, unless her mode lets that kind run on its own " +
      "(Auto: routine bookings; never anything handed to a client). The result says whether it is pending or already done.",
    input: {
      kind: z.enum(QUEUEABLE_KINDS).describe("What kind of action this is."),
      title: z.string().trim().min(1).max(200).describe("A short line the clinician sees in her inbox."),
      preview: jsonObject.optional().describe("What the clinician sees before approving, e.g. { body: '...' }."),
      payload: jsonObject.optional().describe("What the executor needs to carry it out after approval."),
    },
    output: { status: z.enum(["pending", "done", "failed"]), approval_id: z.string().uuid() },
    annotations: { destructiveHint: false, openWorldHint: false, idempotentHint: false },
    label: "Put a draft in your approvals",
    changesData: false,
    run: async ({ kind, title, preview, payload }, ctx) => {
      const id = await queueApproval({ kind, title, preview, payload, createdBy: ctx.by });
      const [row] = await db()<{ status: string }[]>`select status from practice_os.approvals where id = ${id}`;
      const status = row?.status === "done" || row?.status === "failed" ? row.status : "pending";
      return {
        // Second text block too: some clients (Muse) read only text, not structuredContent.
        content: [
          { type: "text", text: status === "pending" ? "queued for clinician approval" : `ran on its own under her mode: ${status}` },
          { type: "text", text: `approval_id: ${id}` },
        ],
        structuredContent: { status: status as "pending" | "done" | "failed", approval_id: id },
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

  // ---- Documents (lib/documents): everything Admin holds or can make, as cards in the chat.
  tool({
    name: "find_documents",
    title: "Find her documents",
    description:
      "Finds the paperwork Practice-OS already has or can make, as cards she can open (already filled in) or download right in the chat: " +
      "deadlines with their official source, insurance applications (BCBSIL, Aetna, Medicare...), the prepared Medicare CMS-855I, the CAQH re-attestation checklist, " +
      "her credentialing profile and its documents (license, malpractice face sheet, diploma, CV, W-9: on file or missing), Good Faith Estimates, superbills, " +
      "release of information forms and how-do-I guides. Use it whenever she asks to see, show, pull up or find documents or forms, or 'what do I need for X'. " +
      "Search by her words (query), a kind, a payer, or what is due within some days. Read-only.",
    input: {
      query: z.string().trim().max(200).optional().describe("Her words, e.g. 'BCBS follow-up', 'CAQH', 'malpractice', 'release form'."),
      kind: z.enum(DOCUMENT_KINDS).optional().describe("Only this kind."),
      payer: z.string().trim().max(120).optional().describe("Only this payer, e.g. 'BCBSIL' or 'Medicare'."),
      due_within_days: z.number().int().min(0).max(365).optional().describe("Only documents with a date within this many days."),
    },
    output: { documents: z.array(z.record(z.unknown())) },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    label: "Found your documents",
    changesData: false,
    run: async (q) => {
      const { cards, matched } = await documents.findDocuments(q);
      const show = "Her cards are in the chat under your answer, so don't list them again or name a page. Say in a few sentences what needs her first and what only she can do.";
      return withCards(
        !cards.length
          ? { found: 0, next: "Nothing matched. Say what you looked for and offer to make it if it's something Practice-OS makes." }
          : matched
            ? { found: cards.length, next: show }
            : { found: cards.length, matched_her_words: false, next: `Nothing matched her words exactly, so these are what's coming up soonest. Say so. ${show}` },
        cards,
      );
    },
  }),

  tool({
    name: "open_document",
    title: "Open one document",
    description:
      "Shows one document as a card (by its id from find_documents, e.g. 'superbill:<id>' or 'guide:caqh-reattestation'): " +
      "its status, dates, what only she can do, and links to open it filled in and download the PDF. Read-only.",
    input: { id: z.string().trim().min(3).max(120) },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    label: "Opened a document",
    changesData: false,
    run: async ({ id }) => {
      const c = await documents.openDocument(id);
      if (!c) return { content: [{ type: "text", text: `No document with id ${id}. Use find_documents to look it up.` }], isError: true };
      return withCards({ next: "Her card is in the chat under your answer." }, [c]);
    },
  }),

  tool({
    name: "create_document",
    title: "Make a document",
    description:
      "Makes one document and shows it as a card: a Good Faith Estimate (gfe, queued for her approval), a superbill, an Illinois release of information form " +
      "(release_form; needs the date the consent ends), or a payer enrollment form (payer_form: Medicare's CMS-855I from her credentialing profile). " +
      "Pass the fields for that kind only, the same as draft_gfe, draft_superbill and make_release_form take. Takes no client details. " +
      "It prepares; it never signs, sends or submits anything: she does that herself.",
    input: {
      kind: z.enum(["gfe", "superbill", "release_form", "payer_form"]),
      gfe: z.object(gfeInput).optional().describe("For kind gfe."),
      superbill: z.object(superbillInput).optional().describe("For kind superbill."),
      release_form: z.object(releaseInput).optional().describe("For kind release_form."),
      payer_form: z.object({ form: z.enum(["cms855i"]) }).optional().describe("For kind payer_form."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: false },
    label: "Made a document",
    // A superbill row or a Medicare application row is saved; an estimate only queues an approval, a release form saves nothing.
    changesData: ((input: { kind: string }) => input.kind === "superbill" || input.kind === "payer_form") as (input: never) => boolean,
    run: async (input, ctx) => {
      const fields = input[input.kind as keyof typeof input];
      if (!fields || typeof fields !== "object") return { content: [{ type: "text", text: `Pass the fields for ${input.kind} under "${input.kind}".` }], isError: true };
      if (input.kind === "gfe") return makeGfe(input.gfe!, ctx);
      if (input.kind === "superbill") return makeSuperbill(input.superbill!, ctx);
      if (input.kind === "release_form") return makeRelease(input.release_form!);
      return makeCms855i(ctx);
    },
  }),

  // MCP only: in the chat she adds a file with the + button (app/api/chat/upload), which runs the same steps.
  tool({
    name: "file_upload",
    title: "Add a business document",
    description:
      "Reads one business document from Practice-OS's inbox folder on this computer (PRACTICE_OS_DATA_DIR/inbox; PDF, Word .docx or plain text): a payer contract, fee schedule, licensing board letter, " +
      "malpractice face sheet, W-9 or CE certificate. Checks it for crisis words, client records and client details before any model reads it; refuses client records. " +
      "Keeps it in Practice-OS, sorts it, and puts anything it changes in her records (a new deadline, a payer date, CE hours) in her approvals. Returns its card.",
    input: { path: z.string().trim().min(1).max(1000).describe("The file's name in the inbox folder, or its full path inside it.") },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    label: "Read and kept your document",
    changesData: true,
    mcpOnly: true,
    run: async ({ path: filePath }, ctx) => {
      const { lstat, readFile, realpath } = await import("node:fs/promises");
      const path = await import("node:path");
      const { fileUpload } = await import("../uploads/file");
      const { MAX_BYTES } = await import("../uploads/read");
      const { inboxDir } = await import("../uploads/store");
      // Only files in the inbox folder, never a link: so no caller can reach .env, keys or anything else on the computer.
      const inbox = await realpath(inboxDir()).catch(() => null);
      if (!inbox) return { content: [{ type: "text", text: `Put the file in ${inboxDir()} first.` }], isError: true };
      const wanted = path.resolve(inbox, filePath);
      const info = await lstat(wanted).catch(() => null);
      if (!info?.isFile() || info.isSymbolicLink()) return { content: [{ type: "text", text: `No file with that name in ${inboxDir()}.` }], isError: true };
      const real = await realpath(wanted);
      if (path.dirname(real) !== inbox) return { content: [{ type: "text", text: `Only files directly in ${inboxDir()} can be added.` }], isError: true };
      if (info.size > MAX_BYTES) return { content: [{ type: "text", text: "That file is over 10 MB." }], isError: true };
      const outcome = await fileUpload(new Uint8Array(await readFile(real)), { by: ctx.by });
      if (!outcome.ok) return { content: [{ type: "text", text: outcome.text }], isError: outcome.reason !== "unreadable" ? undefined : true };
      return withCards({ said: outcome.text, approval_id: outcome.approvalId, duplicate: outcome.duplicate }, [outcome.card]);
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
    input: gfeInput,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: false },
    label: "Drafted a Good Faith Estimate",
    changesData: false,
    run: makeGfe,
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
    input: superbillInput,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: false },
    label: "Prepared a superbill",
    changesData: true,
    run: makeSuperbill,
  }),

  tool({
    name: "make_release_form",
    title: "Fill an Illinois release of information form",
    description:
      "Fills an Illinois consent to release mental health information (740 ILCS 110/5, also meeting HIPAA 45 CFR 164.508) with what she tells you: " +
      "who receives it, why, exactly what to release, and the calendar date the consent ends. The expiration date is required: refuse without one and ask her for it. " +
      "Name exactly what to release; a blanket release such as 'all records' isn't valid in Illinois. " +
      "Takes no client details: the client's name and birth date stay blank boxes she fills in herself, and nothing is saved. " +
      "Returns a card that opens the form with these boxes filled and downloads the PDF; she has it signed and keeps a copy. Aeon never sends or signs it.",
    input: releaseInput,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    label: "Filled a release of information form",
    changesData: false,
    run: makeRelease,
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
      if (!profile) return text({ profile: null, next: "Ask her for her details and save them with update_credentialing." });
      const cards = documents.credentialingCards(profile, await practiceToday());
      return { ...text({ profile, sections: cred.sectionValues(profile) }), structuredContent: { documents: cards } };
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
    run: async () => {
      const caqh = await credActions.currentCaqhPrep();
      if (!caqh) return text({ prep: null, next: "Her credentialing profile isn't set up yet." });
      const [checklist, profile, today] = await Promise.all([documents.caqhCard(), cred.loadCredentialingProfile(), practiceToday()]);
      const files = profile ? documents.credentialingCards(profile, today).filter((c) => c.kind === "credential_doc" && c.status !== "On file") : [];
      return { ...text(caqh), structuredContent: { documents: [...(checklist ? [checklist] : []), ...files] } };
    },
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
      "Returns a card that downloads it; or she applies online in PECOS (faster, and it lists MFT and MHC). Also adds a Medicare row to her applications if missing.",
    input: { form: z.enum(["cms855i"]) },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    label: "Prepared your Medicare enrollment form",
    changesData: true,
    run: async (_input, ctx) => makeCms855i(ctx),
  }),

  tool({
    name: "list_payer_applications",
    title: "List her insurance applications",
    description: "Every payer she's applying to or enrolled with: status, applied, follow-up, approved and recredential dates. Read-only.",
    input: {},
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    label: "Checked your insurance applications",
    changesData: false,
    run: async () => {
      const [applications, today] = await Promise.all([payers.listPayerApplications(), practiceToday()]);
      return { ...text({ applications }), structuredContent: { documents: applications.slice(0, 20).map((a) => documents.payerCard(a, today)) } };
    },
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

  // ---- Referrals (lib/referrals) ----------------------------------------------
  tool({
    name: "find_referral_sources",
    title: "Find referral sources near a ZIP",
    description:
      "Searches the free federal NPI Registry for doctors and clinicians near a ZIP code who could refer clients to the " +
      "practice: family medicine, internal medicine, OB/GYN, pediatrics, oncology and other therapists ('primary care' means " +
      "family medicine and internal medicine). Keeps only active providers whose main specialty matches, scores each for fit " +
      "(0-100) and adds them to the Referrals board (column Found). Returns the best matches first. Sends nothing.",
    input: {
      zip: z.string().regex(/^\d{5}$/, "a 5-digit ZIP").optional().describe("The ZIP code to search around. Omit to use the one she set up (her office's)."),
      specialties: z
        .array(z.enum(SPECIALTIES.map((s) => s.id) as [SpecialtyId, ...SpecialtyId[]]))
        .min(1)
        .optional()
        .describe("Which kinds of referral sources to look for. Omit to use the ones she picked in setup."),
      radius_miles: z.number().min(0).max(10).optional().describe("Also search ZIPs whose center is this close. Default 3."),
      show: z.number().int().min(1).max(25).optional().describe("How many to list in the answer. Default 10."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true, idempotentHint: true },
    label: "Found referral sources",
    changesData: true,
    run: async ({ zip: askedZip, specialties: asked, radius_miles, show }) => {
      const setup = await getReferralSettings();
      const zip = askedZip ?? setup.searchZip;
      if (!zip) return text({ needs: "Ask her which ZIP code to search around; she hasn't set one up yet." });
      const specialties = asked ?? (setup.specialties.length ? setup.specialties : DEFAULT_SPECIALTIES);
      const { zips, found, matched } = await findReferralSources({ zip, specialties, radiusMiles: radius_miles });
      const top = interleave(found, show ?? 10).map((p, i) => ({
        rank: i + 1,
        id: p.id,
        name: p.name,
        specialty: p.specialtyLabel,
        miles: p.distanceMiles,
        fit_score: p.fitScore,
        address: `${p.address}, ${p.city}, ${p.state} ${p.zip}`,
        phone: p.phone,
        npi: p.npi,
      }));
      return text({
        searched_zips: zips,
        matched,
        on_board: `${found.length} best matches are on the Referrals board under Found (/referrals).`,
        best_matches: top,
      });
    },
  }),

  tool({
    name: "list_referral_sources",
    title: "List the Referrals board",
    description:
      "Lists the cards on her Referrals board, best fit first, with each one's id, column (found, contacted, follow_up, " +
      "connected, not_a_fit), specialty, miles, fit score and follow-up date. Read-only.",
    input: {
      stage: z.enum(STAGES).optional().describe("Only this column."),
      limit: z.number().int().min(1).max(50).optional().describe("How many. Default 20."),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    label: "Checked your Referrals board",
    changesData: false,
    run: async ({ stage, limit }) => {
      const all = await listSources();
      const rows = all.filter((s) => !stage || s.stage === stage).slice(0, limit ?? 20);
      return text({
        total_on_board: all.length,
        cards: rows.map((s) => ({
          id: s.id,
          name: s.name,
          column: STAGE_LABEL[s.stage],
          specialty: s.specialty ?? s.taxonomy,
          miles: s.distance_miles,
          fit_score: s.fit_score,
          follow_up_on: s.next_follow_up_on,
          sample: s.is_sample,
        })),
      });
    },
  }),

  tool({
    name: "move_referral_source",
    title: "Move a card on the Referrals board",
    description: "Moves one referral source to another column of her Referrals board (by its id). Sends nothing.",
    input: { id: z.string().uuid(), stage: z.enum(STAGES) },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    label: "Moved a card on your Referrals board",
    changesData: true,
    run: async ({ id, stage }) => {
      const moved = await moveSource(id, stage, "aeon");
      return text(moved ? { moved: true, name: moved.name, column: STAGE_LABEL[stage] } : { moved: false, reason: "No card with that id." });
    },
  }),

  // Muse writes; nothing is sent. Approving makes a Gmail draft to the test inbox.
  tool({
    name: "draft_outreach",
    title: "Draft an introduction letter",
    description:
      "Writes a short professional introduction letter from the clinician to one referral source on her board (by its id): " +
      "who she sees and an offer of a 15-minute call. Never offers fees, gifts or anything of value. The letter waits in her " +
      "approvals; when she approves it, it becomes a Gmail draft in her test inbox for her to send, the card moves to " +
      "Contacted and a follow-up is set a week out. Takes about 10 seconds.",
    input: {
      id: z.string().uuid().describe("The referral source's id, from find_referral_sources or list_referral_sources."),
      note: z.string().trim().max(500).optional().describe("Anything she wants the letter to mention, in her words."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true, idempotentHint: false },
    label: "Drafted an introduction letter",
    changesData: false,
    run: async ({ id, note }, ctx) => {
      const { approvalId, subject, letter, source } = await draftOutreach(id, { by: ctx.by, note });
      const [row] = await db()<{ status: string }[]>`select status from practice_os.approvals where id = ${approvalId}`;
      return {
        content: [
          { type: "text", text: row?.status === "pending" ? "queued for clinician approval" : `ran on its own under her mode: ${row?.status}` },
          { type: "text", text: JSON.stringify({ approval_id: approvalId, to: source.name, subject, letter }, null, 2) },
        ],
        structuredContent: { status: row?.status ?? "pending", approval_id: approvalId },
      };
    },
  }),

  // ---- Instagram (Instagram session) ---------------------------------------------------------
  tool({
    name: "plan_instagram_week",
    title: "Plan this week's Instagram posts",
    description:
      "Writes ALL of this week's Instagram posts at once, as full drafts with pictures, one per topic she picked. Use when she asks you to write " +
      "or draft all of this week's posts (not for ideas or a plan). For ideas, what to post, or a posting plan, use post_ideas or weekly_plan first. Each is checked for safety " +
      "(no client stories, testimonials, promises, advice or self-harm) and waits on the Instagram page for her approval. Takes a few minutes.",
    input: {},
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true, idempotentHint: false },
    label: "Planned this week's posts",
    changesData: true,
    run: async (_input, ctx) => {
      const r = await instagram.planWeek(ctx.by, { chat: ctx.chat });
      if (r.declined) return text({ written: false, why: instagram.DECLINED });
      return text({ week_of: r.week, waiting_for_approval: r.saved.length - r.blocked, blocked: r.blocked, see: "/instagram" });
    },
  }),

  tool({
    name: "draft_instagram_post",
    title: "Draft one Instagram post",
    description:
      "Writes one Instagram post she asked for, in her words, then checks it and makes its picture; it waits for her approval. " +
      "Posts cover practice logistics only. If she asks about a client, a review or anything clinical, nothing is written: tell her why and offer the logistics angle it returns (offer_instead); " +
      "suicide or self-harm topics are refused. Pass her request as she said it.",
    input: {
      request: z.string().trim().min(3).max(600),
      pillar: z.enum(["first_session", "fees_superbills", "how_to_book", "meet_the_clinician", "office_telehealth"]).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true, idempotentHint: false },
    label: "Drafted an Instagram post",
    changesData: true,
    run: async ({ request, pillar }, ctx) => {
      const r = await instagram.requestPost(ctx.by, request, pillar ?? null, { chat: ctx.chat });
      if (r.outcome === "blocked" || r.outcome === "declined") return text({ written: false, why: r.why });
      if (r.outcome === "off_topic") return text({ written: false, why: r.why, offer_instead: r.angle.label });
      return text({
        written: r.outcome !== "blocked_after_rewrite",
        headline: r.headline,
        approval_id: r.post.approvalId,
        changed_from_her_request: r.outcome === "rewritten",
        why: r.why,
        see: "/instagram",
      });
    },
  }),

  tool({
    name: "research_post_topic",
    title: "Research a post topic",
    description:
      "Before writing a post about a topic she names, finds what therapists post about it, which hooks and formats work and why, with source links: " +
      "three small web searches run at once, then 2-3 logistics angles. Show her the short summary and the angles with their links, and ask which one to write. " +
      "Never searches Instagram itself. Advice topics are refused with the nearest logistics angle (offer_instead).",
    input: { topic: z.string().trim().min(3).max(300) },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true, idempotentHint: false },
    label: "Researched a post topic",
    changesData: true,
    run: async ({ topic }) => {
      const r = await instagram.researchPost(topic);
      if (r.outcome === "blocked" || r.outcome === "declined") return text({ researched: false, why: r.why });
      if (r.outcome === "off_topic") return text({ researched: false, why: r.why, offer_instead: r.angle.label });
      const { research } = r;
      return text({
        summary: research.summary,
        from_the_web: research.source === "web",
        angles: research.angles.map((a, i) => ({ number: i + 1, title: a.title, hook: a.hook, format: a.format, why: a.why, links: a.sources })),
        next: "Ask which angle to write; then draft_instagram_post with that angle's title and hook as the request.",
        see: "/instagram",
      });
    },
  }),

  tool({
    name: "list_instagram_posts",
    title: "Instagram posts",
    description: "Lists her recent Instagram posts with their status: waiting for her, ready for her to post herself, blocked (and why) or failed.",
    input: { limit: z.number().int().min(1).max(30).default(10) },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    label: "Checked your Instagram posts",
    changesData: false,
    run: async ({ limit }) => {
      const posts = await instagram.listPosts({ limit });
      return text({
        posts: posts.map((p) => ({
          headline: p.headline,
          pillar: p.pillar,
          status: p.status,
          why_blocked: p.blockedReason,
          why_failed: p.failedReason,
          link: p.permalink,
        })),
      });
    },
  }),

  // ---- Instagram content coach (lib/instagram/coach.ts): ideas and plans first,
  // then a draft of the one she picks. Needs no relay or Meta app.
  tool({
    name: "instagram_account_steps",
    title: "How to make an Instagram business account",
    description:
      "The five plain steps to make an Instagram business account for her practice. Use when she asks how to set up, start or make an Instagram.",
    input: {},
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    label: "Got the Instagram setup steps",
    changesData: false,
    run: async () => text({ steps: ACCOUNT_STEPS, after: "Aeon writes the posts; she posts them herself in the Instagram app. There's nothing to connect." }),
  }),

  tool({
    name: "post_ideas",
    title: "Instagram post ideas",
    description:
      "Suggests Instagram post ideas for this week from her saved answers (goals, topics, style, what posts never show, how often). " +
      "Each idea has a hook (opening line), 2-3 points, a call to action such as how to book, and a suggested picture. Practice logistics only. " +
      "Use when she asks for post ideas, what to post, or help with content. Show them numbered, then ask which one to write; don't draft yet. " +
      "When she picks one of the ideas already shown, don't call this again: use draft_post.",
    input: {
      count: z.number().int().min(1).max(5).optional().describe("How many ideas. Omit to use her usual number."),
      topic: z.enum(["first_session", "fees_superbills", "how_to_book", "meet_the_clinician", "office_telehealth"]).optional().describe("Only when she names one topic."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true, idempotentHint: false },
    label: "Came up with post ideas",
    changesData: true,
    run: async ({ count, topic }, ctx) => text(coach.ideasForModel(await coach.postIdeas(ctx.by, { count, topic, chat: ctx.chat }))),
  }),

  tool({
    name: "weekly_plan",
    title: "This week's posting plan",
    description:
      "Makes a posting calendar for the coming week at her chosen pace (1, 3 or 5 posts a week), one dated idea per post day, each with a hook, " +
      "points, a call to action and a picture idea. Drafts and posts nothing. Use when she asks for a posting plan, schedule or calendar. " +
      "When she picks a day or idea from a plan already shown, use draft_post. When she asks you to write all the posts, use plan_instagram_week.",
    input: {},
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true, idempotentHint: false },
    label: "Made a posting plan",
    changesData: true,
    run: async (_input, ctx) => text(coach.ideasForModel(await coach.postIdeas(ctx.by, { plan: true, chat: ctx.chat }))),
  }),

  tool({
    name: "draft_post",
    title: "Draft one of the post ideas",
    description:
      "Turns one idea from her latest list (post_ideas or weekly_plan) into a full caption in her picked style, checks it, makes its picture, " +
      "and puts it in Approvals for her OK. Use when she picks an idea: 'draft the second one' is idea 2, 'write the first one' is idea 1. " +
      "Her latest list is saved, so call this directly with the number; don't make new ideas or a new plan first. Aeon never posts: " +
      "once she approves it, it's ready for her to post herself.",
    input: {
      idea: z.number().int().min(1).max(5).optional().describe("The idea's number in her latest list."),
      idea_id: z.string().uuid().optional().describe("Or the idea's id."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true, idempotentHint: false },
    label: "Drafted the post",
    changesData: true,
    run: async ({ idea, idea_id }, ctx) => {
      if (!idea && !idea_id) return text({ written: false, why: "Ask which idea she wants written." });
      const r = await coach.draftIdea(ctx.by, { number: idea, id: idea_id }, { chat: ctx.chat });
      if (!r.found) return text({ written: false, why: r.why });
      if (r.outcome === "blocked" || r.outcome === "declined") return text({ written: false, why: r.why });
      if (r.outcome === "off_topic") return text({ written: false, why: r.why, offer_instead: r.angle.label });
      if (r.outcome === "already_drafted") {
        return text({ written: false, already_drafted: true, idea: r.idea.number, headline: r.headline, approval_id: r.post.approvalId, why: "She already has a draft of this idea; it's in Approvals or on the Instagram page." });
      }
      return text({
        written: r.outcome !== "blocked_after_rewrite",
        idea: r.idea.number,
        headline: r.headline,
        approval_id: r.post.approvalId,
        why: r.why,
        ...(r.outcome !== "blocked_after_rewrite"
          ? { next: "It's waiting in Approvals. Once she approves it, the Instagram page has the caption to copy, the picture to save and the steps to post it herself." }
          : {}),
      });
    },
  }),

  // ---- Front Desk (lib/frontdesk). Callers' names, numbers and words never
  // reach the model: these tools give counts, statuses and reference ids only.
  tool({
    name: "front_desk_status",
    title: "Front Desk: calls, texts and consults",
    description:
      "Answers 'Who called today?' and 'What's booked?' for the practice line: how many calls and texts are new, need the clinician, " +
      "are waiting on the caller or are booked; upcoming consult times; whether her phone company and calendar are connected; " +
      "and the open inquiries by id, channel, status and time. Never includes callers' names, numbers or messages.",
    input: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
    label: "Checked Front Desk",
    changesData: false,
    run: async () => {
      const { frontDeskSummary } = await import("../frontdesk/summary");
      return text(await frontDeskSummary());
    },
  }),

  tool({
    name: "front_desk_check_now",
    title: "Front Desk: check for new voicemails and texts",
    description:
      "Reads new voicemails and texts from the clinician's own phone company now (it also runs every minute while the app is open). " +
      "Each one is crisis-checked first; Front Desk then follows her Front Desk switches.",
    input: {},
    annotations: { readOnlyHint: false, openWorldHint: true, idempotentHint: true },
    label: "Checked the practice line for new calls and texts",
    changesData: true,
    run: async () => {
      const { checkFrontDesk } = await import("../frontdesk/check");
      return text(await checkFrontDesk());
    },
  }),

  tool({
    name: "offer_consult_times",
    title: "Front Desk: offer a caller three consult times",
    description:
      "Puts a text with three open consult times for one inquiry (id from front_desk_status) in her approvals. " +
      "The wording is fixed; nothing is sent until she approves, unless her mode allows it.",
    input: { inquiry_id: z.string().uuid().describe("The inquiry id from front_desk_status.") },
    output: { outcome: z.string(), approval_id: z.string().uuid().optional() },
    annotations: { destructiveHint: false, openWorldHint: false, idempotentHint: false },
    label: "Put consult times for a caller in your approvals",
    changesData: false,
    run: async ({ inquiry_id }) => {
      const { offerTimes } = await import("../frontdesk/offers");
      const out = await offerTimes(inquiry_id, { purpose: "book", createdBy: "aeon" });
      return { ...text(out), structuredContent: out };
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
  // An MCP-only tool (file_upload reads a file on this computer) never runs for the chat or anyone else.
  if (tool.mcpOnly && !ctx.by.startsWith("mcp:")) return { content: [{ type: "text", text: `${name} works only over MCP. In the chat she adds a file with the + button.` }], isError: true };
  const parsed = z.object(tool.input).safeParse(args ?? {});
  const changes = typeof tool.changesData === "function" ? (parsed.success ? tool.changesData(parsed.data as never) : true) : tool.changesData;
  if (ctx.viewOnly && changes) return { content: [{ type: "text", text: VIEW_ONLY }], isError: true };
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
    return { content: [{ type: "text", text: `Invalid input for ${name}: ${problems}` }], isError: true };
  }
  const mode = ctx.mode;
  // Manual: a change to her records waits in the ask bar as one aeon_action approval.
  if (mode === "manual" && changes && !ctx.approved && !ALWAYS_RUNS.has(tool.name)) {
    const approvalId = await queueApproval({
      kind: "aeon_action",
      title: tool.title,
      preview: { body: `${tool.label}. Aeon will run this once you approve it.`, tool: tool.name, args: parsed.data },
      payload: { tool: tool.name, args: parsed.data },
      createdBy: ctx.by,
    });
    return text({ waiting_for_her: true, approval_id: approvalId, next: "You're in Manual mode: tell her it's waiting for her OK in the bar above the chat box." });
  }
  const run = () => tool.run(parsed.data as never, ctx);
  return guardResult(await (mode ? withOrigin({ mode }, run) : run()));
}

/** The tool list in Chat Completions shape (cookbook 03_tool_calling.ipynb). */
export function chatTools(names?: string[]) {
  return TOOLS.filter((t) => !t.mcpOnly && (!names || names.includes(t.name))).map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: zodToJsonSchema(z.object(t.input), { $refStrategy: "none", target: "openApi3" }) as Record<string, unknown>,
    },
  }));
}
