// More Referrals tools for Aeon (chat and MCP), spread into TOOLS in tools.ts:
// find a card anywhere on the board by name, specialty or ZIP; mark someone
// do-not-contact; change a letter that is still waiting for her approval; and save her niche.
// They go through runTool like every other tool (input check, view-only rule,
// the sensitive-info guard on the result).
import { z } from "zod";
import type { chat } from "../meta";
import { contactsFor, CONTACT_LABEL, NoNpiToList, screenedNote, suppress, suppressionFor, unsuppress } from "../referrals/contacts";
import { evidenceFor } from "../referrals/evidence/store";
import { isNichePreset, NICHE_PRESET_BY_ID, NICHE_PRESETS } from "../referrals/catalog";
import { SPECIALTY_BY_ID, specialtyForCode } from "../referrals/nppes";
import { saveReferralSettings, specialtiesForNiche } from "../referrals/settings";
import { LetterNotWaiting, pendingLetter, reviseLetter } from "../referrals/outreach";
import { normalizeName, normalizeOrg } from "../referrals/evidence/normalize";
import { cardsNamed } from "../referrals/plan";
import { listSources, STAGE_LABEL, STAGES, type ReferralSource } from "../referrals/store";
import { isSensitive, SOURCE_TYPES } from "../referrals/catalog";
import { readManual } from "../referrals/manual";
import { addManual } from "../referrals/org-store";

const SOURCE_TYPE_IDS = SOURCE_TYPES.map((t) => t.id) as [string, ...string[]];
import type { AeonTool, ToolContext, ToolResult } from "./tools";

const text = (value: unknown): ToolResult => ({ content: [{ type: "text", text: JSON.stringify(value, null, 2) }] });

function tool<I extends z.ZodRawShape>(
  def: Omit<AeonTool, "run" | "input" | "preflight"> & {
    input: I;
    run: (input: z.infer<z.ZodObject<I>>, ctx: ToolContext) => Promise<ToolResult>;
    preflight?: (input: z.infer<z.ZodObject<I>>, ctx: ToolContext) => Promise<ToolResult | null>;
  },
): AeonTool {
  return def as unknown as AeonTool;
}

/** Said with every card list: the names are providers from a public registry, and never get a guessed gender. */
export const ABOUT_NAMES =
  "These are doctors and clinicians from the public NPI Registry on her Referrals board, not clients. Call each one by name " +
  "(or 'they'); never guess he or she. Copy addresses, phones and emails exactly as written here (don't add periods or spell out " +
  "St or N), and say who they see (new parents, children, adults), not conditions, so the privacy check doesn't hold the answer back.";

/** Said with organisations found by CMS or OpenStreetMap. */
export const ABOUT_ORGS =
  "Organisations from the CMS Provider Data Catalog or OpenStreetMap are businesses and congregations, not clients. Say where each " +
  "came from; for OpenStreetMap places say 'data © OpenStreetMap contributors (ODbL)'. A hospice's office address is where it is " +
  "based, not where it serves. Never offer anything in return for a referral.";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One card she has to choose from: enough to tell four Dr. Millers apart. */
export function choiceOf(c: ReferralSource) {
  return {
    id: c.id,
    name: c.name,
    credential: c.credential ?? null,
    specialty: c.specialty ?? null,
    address: [c.address, c.city, c.state, c.zip].filter(Boolean).join(", ") || null,
    column: STAGE_LABEL[c.stage],
  };
}

/** Said with every ask_which: the model never picks for her. */
export const ASK_WHICH =
  "More than one card fits, so nothing changed and nothing was queued. She chooses one of ask_which (name, credential, address); " +
  "the choice is hers, never Aeon's, and its id goes in the next call.";

/** No card fits: said at once, before anything is queued. */
export const noCard = (said: string) =>
  `No card on her Referrals board is named "${said}", so nothing changed and nothing was queued.`;

/** The card her words name: by id, else by name. Several that fit come back to ask which. */
export function resolveCard(said: string, cards: ReferralSource[]): { card: ReferralSource } | { none: true } | { ask_which: ReferralSource[] } {
  const byId = UUID.test(said.trim()) ? cards.find((c) => c.id === said.trim()) : undefined;
  if (byId) return { card: byId };
  const named = cardsNamed(said, cards);
  if (named.length === 0) return { none: true };
  if (named.length > 1) return { ask_which: named.slice(0, 5) };
  return { card: named[0] };
}

/** Her words name this card exactly: every word of the name she said is a word of the card's name, or the practice's name. */
export function namesExactly(said: string, card: Pick<ReferralSource, "name" | "organization" | "npi_type">): boolean {
  const q = normalizeName(said).tokens;
  if (card.npi_type !== "organization" && q.length > 0) {
    const have = new Set(normalizeName(card.name).tokens);
    if (q.every((w) => have.has(w))) return true;
  }
  const org = normalizeOrg(said);
  const theirs = normalizeOrg(card.organization ?? card.name);
  return org.length > 0 && ` ${theirs} `.includes(` ${org} `);
}

/**
 * For changes that stop or start contact: only one card that her words name
 * exactly ("Dr. Chen" never means Cheng). A near miss or several candidates
 * come back to ask which; nothing changes.
 */
export function resolveExact(said: string, cards: ReferralSource[]): { card: ReferralSource } | { none: true } | { ask_which: ReferralSource[] } {
  const byId = UUID.test(said.trim()) ? cards.find((c) => c.id === said.trim()) : undefined;
  if (byId) return { card: byId };
  const named = cardsNamed(said, cards);
  const exact = cards.filter((c) => namesExactly(said, c));
  const candidates = [...new Set([...exact, ...named])];
  if (candidates.length === 0) return { none: true };
  if (candidates.length === 1 && exact.length === 1) return { card: exact[0] };
  return { ask_which: candidates.slice(0, 5) };
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const KIND_WORDS: [RegExp, string][] = [
  [/\b(?:ob|obgyn|ob-gyn|ob\/gyn|gyn\w*|obstetric\w*)\b/i, "ob_gyn"],
  [/\bpediatric\w*|\bpaediatric\w*|\bkids? doctors?\b/i, "pediatrics"],
  [/\bfamily (?:medicine|doctors?|practice)\b|\bprimary care\b|\bgps?\b/i, "family_medicine"],
  [/\binternal medicine\b|\binternists?\b/i, "internal_medicine"],
  [/\bpsychiatr\w*/i, "psychiatry"],
  [/\boncolog\w*|\bcancer\b/i, "oncology"],
  [/\btherapists?\b|\bcounselou?rs?\b|\bsocial workers?\b|\bpsychologists?\b/i, "therapists"],
];

/** Every card that fits what she said: a name or practice, a kind of provider, a ZIP or a city. Names first. */
export function searchCards(query: string, cards: ReferralSource[]): ReferralSource[] {
  const q = query.trim();
  if (!q) return [];
  const named = cardsNamed(q, cards);
  const zips = new Set(q.match(/\b\d{5}\b/g) ?? []);
  const kinds = new Set(KIND_WORDS.filter(([re]) => re.test(q)).map(([, id]) => id));
  const words = squash(q);
  const others = cards.filter((c) => {
    if (named.includes(c)) return false;
    if (c.zip && zips.has(c.zip)) return true;
    const kind = c.taxonomy ? specialtyForCode(c.taxonomy)?.id : undefined;
    if (kind && kinds.has(kind)) return true;
    if (words.length >= 4 && c.city && squash(c.city) === words) return true;
    // A part of a name or practice ("Gordon", "Lakeview"), or the specialty's own words.
    if (words.length >= 4 && [c.name, c.organization, c.specialty].some((v) => v && squash(v).includes(words))) return true;
    return false;
  });
  return [...named, ...others];
}

type ChatFn = typeof chat;

/** The honest line about a letter: what plain code found in it and what it left out. The reply says this, nothing more. */
export function whatItSays(included: string[], leftOut: { what: string; why: string }[]): string {
  const parts: string[] = [];
  if (included.length) parts.push(`It says: ${included.join("; ")}.`);
  if (leftOut.length) parts.push(`It does NOT say: ${leftOut.map((x) => `${x.what} (${x.why})`).join("; ")}.`);
  if (!parts.length) return "";
  return `${parts.join(" ")} Nothing else in it was checked as asked for.`;
}

export const REFERRAL_TOOLS: AeonTool[] = [
  tool({
    name: "set_referral_niche",
    title: "Set your referral niche",
    description:
      "When she tells Aeon her niche or asks to rank referral sources for it ('I focus on oncology and end of life', 'rank for grief " +
      "and loss', 'no niche'): saves one of the catalog niches (Settings › Referrals). The map, the board and the weekly plan rank " +
      "by it from now on. Her saved kinds of provider stay as they are (keep_kinds true, the default); pass keep_kinds: false only " +
      "when she asks to switch her searches to the niche's kinds too. Pass the niche id from the list in the input; 'none' clears " +
      "it. Only pick a niche she named or clearly described; if her words fit two, ask which. Sends nothing.",
    input: {
      niche: z
        .enum(["none", ...NICHE_PRESETS.map((p) => p.id)] as [string, ...string[]])
        .describe(`One of: ${NICHE_PRESETS.map((p) => `${p.id} (${p.label})`).join(", ")}; or none.`),
      keep_kinds: z
        .boolean()
        .optional()
        .describe("Default true: keep her saved kinds of provider. False only when she asked to also switch them to the niche's top kinds."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    label: "Saved your referral niche",
    changesData: true,
    // Her settings: an MCP caller's change waits for her approval.
    queuesOverMcp: true,
    run: async ({ niche, keep_kinds = true }) => {
      const preset = niche === "none" ? null : niche;
      // Checked against the catalog again in saveReferralSettings, whatever the model sent.
      if (preset !== null && !isNichePreset(preset)) return text({ saved: false, why: "That isn't one of the niches. Ask her which one fits." });
      const kinds = preset && !keep_kinds ? specialtiesForNiche(preset) : [];
      await saveReferralSettings({ nichePreset: preset, ...(kinds.length ? { specialties: kinds } : {}) }, undefined, "aeon");
      return text({
        saved: true,
        niche: preset ? NICHE_PRESET_BY_ID.get(preset)!.label : null,
        ...(kinds.length ? { looks_for_first: kinds.map((k) => SPECIALTY_BY_ID.get(k)!.label) } : {}),
        note: preset
          ? "Her map, board and weekly plan now rank by this niche. She can change it in Settings › Referrals."
          : "No niche: everyone is ranked the plain way again. She can pick one in Settings › Referrals.",
      });
    },
  }),

  tool({
    name: "find_referral_cards",
    title: "Find a card on the Referrals board",
    description:
      "Searches EVERY card on her Referrals board (not just the top ones) by a name or practice ('Dr. Gordon', 'Lakeview Pediatrics'), " +
      "a kind of provider ('pediatricians', 'OB-GYN'), a ZIP code or a city, and returns each match's id, column, specialty, address, " +
      "phone, email (hers or the one Aeon found, and where it came from), follow-up date and her latest log entry. Use this whenever she " +
      "asks about a particular provider or a kind of provider on her board, before saying someone isn't there. Call providers by name " +
      "or 'they'; never guess he or she. Read-only.",
    input: {
      query: z.string().trim().min(2).max(120).describe("Her words: a name, practice, kind of provider, ZIP or city."),
      stage: z.enum(STAGES).optional().describe("Only this column."),
      limit: z.number().int().min(1).max(25).optional().describe("How many to return. Default 10."),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    label: "Looked on your Referrals board",
    changesData: false,
    run: async ({ query, stage, limit }) => {
      const all = await listSources();
      const matches = searchCards(query, all).filter((c) => !stage || c.stage === stage);
      const shown = matches.slice(0, limit ?? 10);
      const [evidence, rawLog] = await Promise.all([
        evidenceFor(shown.map((c) => ({ id: c.id, npi_type: c.npi_type }))).catch(() => ({}) as Awaited<ReturnType<typeof evidenceFor>>),
        contactsFor(shown.map((c) => c.id)).catch(() => ({}) as Awaited<ReturnType<typeof contactsFor>>),
      ]);
      // Her notes are checked again with the chat's full privacy check; one that fails is left out.
      const notes = new Map<string, string | null>();
      for (const c of shown) {
        const last = rawLog[c.id]?.[0];
        if (last) notes.set(c.id, await screenedNote(last.note));
      }
      const log = rawLog;
      return text({
        searched: `all ${all.length} cards on the board`,
        matches: matches.length,
        ...(matches.length === 0 ? { none: `No card on her board fits "${query}". Say so plainly; offer to search the NPI Registry near her (find_referral_sources).` } : {}),
        cards: shown.map((c) => {
          const email = evidence[c.id]?.fields.email;
          const last = log[c.id]?.[0];
          return {
            id: c.id,
            name: c.name,
            column: STAGE_LABEL[c.stage],
            specialty: c.specialty ?? c.taxonomy,
            organization: c.organization,
            address: [c.address, c.city, c.state, c.zip].filter(Boolean).join(", ") || null,
            phone: c.phone,
            email: email?.value ?? c.email ?? null,
            email_from: email ? (email.origins[0] === "clinician" ? "she typed it" : "Aeon found it; she should confirm it") : c.email ? "on the card" : null,
            ...(c.sensitive ? { contact: "Contact through their public line only. Never give or look up their street address." } : {}),
            follow_up_on: c.next_follow_up_on,
            last_logged: last
              ? `${CONTACT_LABEL[last.kind]} on ${last.happened_on}${notes.get(c.id) ? `: ${notes.get(c.id)}` : last.note ? " (note held back by the privacy check)" : ""}`
              : null,
            sample: c.is_sample,
          };
        }),
        about_names: ABOUT_NAMES,
      });
    },
  }),

  tool({
    name: "set_do_not_contact",
    title: "Don't contact someone again",
    description:
      "When she says a referral source isn't interested, asked not to be contacted, or 'don't contact them again': moves the card to " +
      "Not a fit, clears its follow-up, and puts them on her do-not-contact list (by NPI, or for a card with no NPI by its name and " +
      "address or city) so no search, weekly plan, letter or debrief suggests them again. " +
      "A note alone does NOT do this, so use this tool, not log_referral_contact. A letter to them still waiting in Approvals is declined. " +
      "Name the card as she said it or pass its id; it acts only on an exact name match, otherwise it returns ask_which: list them " +
      "(name, credential, address), ask her which and call again with the id; never pick one yourself. undo: true takes them " +
      "off the list (the card stays where it is); if they asked not to be contacted, ask her to confirm first and pass confirmed: true. Sends nothing.",
    input: {
      source: z.string().trim().min(2).max(160).describe("The card's name as she said it, or its id."),
      reason: z.enum(["not_interested", "asked_not_to"]).optional().describe("asked_not_to when they asked not to be contacted; else not_interested."),
      undo: z.boolean().optional().describe("True to take them off the do-not-contact list."),
      confirmed: z.boolean().optional().describe("Undo only: true after she confirmed, in this chat, she wants to contact someone who asked not to be."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    label: "Updated your do-not-contact list",
    changesData: true,
    // The card is found before anything waits in her ask bar: no match or several matches answer at once.
    preflight: async ({ source }) => {
      const found = resolveExact(source, await listSources());
      if ("none" in found) return text({ done: false, why: noCard(source) });
      if ("ask_which" in found) return text({ done: false, why: ASK_WHICH, ask_which: found.ask_which.map(choiceOf) });
      return null;
    },
    run: async ({ source, reason, undo, confirmed }) => {
      const found = resolveExact(source, await listSources());
      if ("none" in found) return text({ done: false, why: noCard(source) });
      if ("ask_which" in found) return text({ done: false, why: ASK_WHICH, ask_which: found.ask_which.map(choiceOf) });
      const card = found.card;
      if (undo) {
        const was = await suppressionFor(card.id);
        if (!was) return text({ done: false, name: card.name, why: "They aren't on her do-not-contact list. Nothing changed." });
        if (was === "asked_not_to" && !confirmed) {
          return text({
            done: false,
            name: card.name,
            needs_confirmation: `${card.name} asked not to be contacted. Ask her plainly whether she wants to take them off the list anyway; only after she says yes, call again with confirmed: true.`,
          });
        }
        await unsuppress(card.id, undefined, "aeon");
        return text({ done: true, name: card.name, do_not_contact: false, column: STAGE_LABEL[card.stage], note: "Searches and the weekly plan can suggest them again." });
      }
      let declined: string[];
      try {
        ({ declined } = await suppress(card.id, reason ?? "not_interested", undefined, "aeon"));
      } catch (err) {
        if (err instanceof NoNpiToList) return text({ done: false, name: card.name, never_suggested_again: false, why: err.message });
        throw err;
      }
      // A pending letter was declined with it; one she already approved stays hers to delete or ignore.
      const ready = await pendingLetter(card.id);
      return text({
        done: true,
        name: card.name,
        do_not_contact: true,
        column: STAGE_LABEL.not_a_fit,
        follow_up: "cleared",
        never_suggested_again: true,
        ...(declined.length ? { letters_declined: declined.length, letters_note: "The letter to them that was waiting in Approvals was declined, so it's gone from there." } : {}),
        ...(ready ? { letter_already_approved: "A letter to them was already approved and is ready to copy on the card; tell her not to send it." } : {}),
      });
    },
  }),

  tool({
    name: "revise_referral_letter",
    title: "Change a waiting introduction letter",
    description:
      "Changes the introduction letter to someone on her board that is still waiting in her approvals, in place (never a second " +
      "letter): pass `change` with what she asked ('make it shorter', 'mention I take BCBS', 'say I can drop off flyers') and Aeon " +
      "rewrites it, or `letter` with her exact new text. The same rules apply: nothing of value, no fees, only insurers she is in " +
      "network with (one she applied to only as 'application pending'), years only from her profile. Plain code checks what the new " +
      "letter says: tell her exactly what `included` and `left_out` say, never more. Name the card as she said it, or pass the " +
      "approval_id from draft_outreach. A letter she already approved or dismissed isn't changed. Sends nothing. Takes about 10 seconds.",
    input: {
      source: z.string().trim().min(2).max(160).optional().describe("The card's name as she said it, or its id."),
      approval_id: z.string().uuid().optional().describe("The letter's approval id, if you have it."),
      change: z.string().trim().min(2).max(500).optional().describe("What she wants changed, in her words."),
      letter: z.string().trim().min(80).max(2500).optional().describe("Her exact new letter text, only when she wrote it herself."),
      subject: z.string().trim().min(2).max(150).optional().describe("A new subject line, if she gave one."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true, idempotentHint: false },
    label: "Changed the waiting letter",
    changesData: true,
    preflight: async ({ source, approval_id }) => {
      if (approval_id || !source) return null;
      const found = resolveCard(source, await listSources());
      if ("none" in found) return text({ revised: false, why: noCard(source) });
      if ("ask_which" in found) return text({ revised: false, why: ASK_WHICH, ask_which: found.ask_which.map(choiceOf) });
      return null;
    },
    run: async ({ source, approval_id, change, letter, subject }, ctx) => {
      if (!change && !letter && !subject) return text({ revised: false, why: "Ask her what to change in the letter." });
      let approvalId = approval_id;
      if (!approvalId) {
        if (!source) return text({ revised: false, why: "Say whose letter to change." });
        const found = resolveCard(source, await listSources());
        if ("none" in found) return text({ revised: false, why: noCard(source) });
        if ("ask_which" in found) return text({ revised: false, why: ASK_WHICH, ask_which: found.ask_which.map(choiceOf) });
        const waiting = await pendingLetter(found.card.id);
        if (waiting?.status === "ready") {
          return text({ revised: false, why: `The letter to ${found.card.name} is already approved and ready to send, so it stays as she approved it.` });
        }
        if (!waiting) {
          return text({ revised: false, why: `No letter to ${found.card.name} is waiting for her approval. Offer to draft one (draft_outreach).` });
        }
        approvalId = waiting.id;
      }
      try {
        const r = await reviseLetter(approvalId, {
          by: ctx.by,
          instruction: change,
          letter,
          subject,
          ...(ctx.chat ? { chat: ctx.chat as unknown as ChatFn } : {}),
        });
        return {
          content: [
            { type: "text", text: `changed in place; still waiting for her approval. ${whatItSays(r.included, r.left_out)}` },
            {
              type: "text",
              text: JSON.stringify(
                { revised: true, approval_id: r.approvalId, to: r.source.name, subject: r.subject, letter: r.letter, included: r.included, left_out: r.left_out },
                null,
                2,
              ),
            },
          ],
          structuredContent: { status: "pending", approval_id: r.approvalId },
        };
      } catch (err) {
        if (err instanceof LetterNotWaiting) return text({ revised: false, why: err.message });
        return text({ revised: false, why: err instanceof Error ? err.message : "I couldn't change the letter." });
      }
    },
  }),

  tool({
    name: "add_referral_source",
    title: "Add a referral source by hand",
    description:
      "When she names an organisation or person to add to her Referrals board herself ('add Gilda's Club Chicago as a cancer " +
      "nonprofit, phone 312-555-0100'): saves it under Found, labelled 'Added by you'. `type` is the catalog kind that fits best " +
      "(a cancer or disease nonprofit -> disease_orgs; a grief center -> grief_centers; a hospice -> hospice; a funeral home -> " +
      "funeral_homes; a church or clergy -> clergy; a nurse navigator -> nurse_navigators; a hospital social worker -> " +
      "hospital_social_workers; a support group -> support_group_leaders; a domestic violence or sexual assault agency -> " +
      "dv_sa_agencies; a shelter -> shelters). Copy only what she said; never invent a phone, email, address or website. It needs " +
      "a city or ZIP. A DV/SA agency or shelter keeps only the city (never a street address): say 'contact through their public " +
      "line only'. If it matches a card already on her board it is not added twice: say which card it matched. Someone on her " +
      "do-not-contact list is not added. Sends nothing.",
    input: {
      name: z.string().trim().min(2).max(160).describe("The organisation's or person's name, as she said it."),
      kind: z.enum(["organization", "person"]).optional().describe("person for one professional; organization otherwise (default)."),
      organization: z.string().trim().max(160).optional().describe("For a person: where they work, if she said."),
      type: z.enum(SOURCE_TYPE_IDS).describe("The catalog kind that fits best."),
      phone: z.string().trim().max(40).optional(),
      email: z.string().trim().max(200).optional(),
      street: z.string().trim().max(160).optional().describe("Street address, only if she said it."),
      city: z.string().trim().max(80).optional().describe("The city; Chicago when she says 'in Chicago'."),
      state: z.string().trim().max(2).optional().describe("Two letters, e.g. IL."),
      zip: z.string().trim().max(10).optional(),
      website: z.string().trim().max(300).optional(),
      notes: z.string().trim().max(500).optional().describe("Her words about them. Never anything about a client."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    label: "Added to your Referrals board",
    changesData: true,
    run: async (input) => {
      const read = readManual({ ...input, kind: input.kind ?? (input.organization && input.organization !== input.name ? "person" : "organization") });
      if (!read.ok) return text({ added: false, why: read.error });
      try {
        const r = await addManual(read.input, { by: "aeon" });
        if (r.refused) return text({ added: false, why: r.refused });
        if (r.matched) return text({ added: false, already_on_board: { id: r.matched.id, name: r.matched.name, matched_by: r.matched.label }, note: "It was already on her board, so nothing new was added." });
        return text({
          added: true,
          id: r.id,
          name: r.name,
          column: STAGE_LABEL.found,
          label: "Added by you",
          ...(isSensitive(read.input.type) ? { sensitive: "Saved with the city only, never a street address. Contact through their public line only." } : {}),
        });
      } catch (err) {
        return text({ added: false, why: err instanceof Error ? err.message : "I couldn't add that." });
      }
    },
  }),
];
