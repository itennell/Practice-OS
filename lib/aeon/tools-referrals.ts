// More Referrals tools for Aeon (chat and MCP), spread into TOOLS in tools.ts:
// find a card anywhere on the board by name, specialty or ZIP; mark someone
// do-not-contact; and change a letter that is still waiting for her approval.
// They go through runTool like every other tool (input check, view-only rule,
// the sensitive-info guard on the result).
import { z } from "zod";
import type { chat } from "../meta";
import { contactsFor, CONTACT_LABEL, NoNpiToList, screenedNote, suppress, suppressionFor, unsuppress } from "../referrals/contacts";
import { evidenceFor } from "../referrals/evidence/store";
import { specialtyForCode } from "../referrals/nppes";
import { LetterNotWaiting, pendingLetter, reviseLetter } from "../referrals/outreach";
import { normalizeName, normalizeOrg } from "../referrals/evidence/normalize";
import { cardsNamed } from "../referrals/plan";
import { listSources, STAGE_LABEL, STAGES, type ReferralSource } from "../referrals/store";
import type { AeonTool, ToolContext, ToolResult } from "./tools";

const text = (value: unknown): ToolResult => ({ content: [{ type: "text", text: JSON.stringify(value, null, 2) }] });

function tool<I extends z.ZodRawShape>(
  def: Omit<AeonTool, "run" | "input"> & { input: I; run: (input: z.infer<z.ZodObject<I>>, ctx: ToolContext) => Promise<ToolResult> },
): AeonTool {
  return def as unknown as AeonTool;
}

/** Said with every card list: the names are providers from a public registry, and never get a guessed gender. */
export const ABOUT_NAMES =
  "These are doctors and clinicians from the public NPI Registry on her Referrals board, not clients. Call each one by name " +
  "(or 'they'); never guess he or she. Copy addresses, phones and emails exactly as written here (don't add periods or spell out " +
  "St or N), and say who they see (new parents, children, adults), not conditions, so the privacy check doesn't hold the answer back.";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

export const REFERRAL_TOOLS: AeonTool[] = [
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
      "Not a fit, clears its follow-up, and puts the NPI on her do-not-contact list so no search or weekly plan suggests them again. " +
      "A note alone does NOT do this, so use this tool, not log_referral_contact. Name the card as she said it or pass its id; it acts " +
      "only on an exact name match, otherwise it returns ask_which: ask her which and call again with the id. undo: true takes them " +
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
    run: async ({ source, reason, undo, confirmed }) => {
      const found = resolveExact(source, await listSources());
      if ("none" in found) return text({ done: false, why: `No card on her Referrals board is named "${source}". Nothing changed.` });
      if ("ask_which" in found) {
        return text({
          done: false,
          why: "Not an exact match for one card, so nothing changed. Ask her which one she means, then call again with its id.",
          ask_which: found.ask_which.map((c) => ({ id: c.id, name: c.name, column: STAGE_LABEL[c.stage] })),
        });
      }
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
      try {
        await suppress(card.id, reason ?? "not_interested", undefined, "aeon");
      } catch (err) {
        if (err instanceof NoNpiToList) return text({ done: false, name: card.name, never_suggested_again: false, why: err.message });
        throw err;
      }
      const waiting = await pendingLetter(card.id);
      return text({
        done: true,
        name: card.name,
        do_not_contact: true,
        column: STAGE_LABEL.not_a_fit,
        follow_up: "cleared",
        never_suggested_again: true,
        ...(waiting ? { letter_still_waiting: { approval_id: waiting.id, next: "A letter to them is still in Approvals; tell her she can dismiss it there." } } : {}),
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
      "network with, no years she never gave. Name the card as she said it, or pass the approval_id from draft_outreach. A letter she " +
      "already approved or dismissed isn't changed. Sends nothing. Takes about 10 seconds.",
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
    run: async ({ source, approval_id, change, letter, subject }, ctx) => {
      if (!change && !letter && !subject) return text({ revised: false, why: "Ask her what to change in the letter." });
      let approvalId = approval_id;
      if (!approvalId) {
        if (!source) return text({ revised: false, why: "Say whose letter to change." });
        const found = resolveCard(source, await listSources());
        if ("none" in found) return text({ revised: false, why: `No card on her Referrals board is named "${source}".` });
        if ("ask_which" in found) {
          return text({ revised: false, why: "More than one card fits; ask her which.", ask_which: found.ask_which.map((c) => ({ id: c.id, name: c.name })) });
        }
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
            { type: "text", text: "changed in place; still waiting for her approval" },
            { type: "text", text: JSON.stringify({ revised: true, approval_id: r.approvalId, to: r.source.name, subject: r.subject, letter: r.letter }, null, 2) },
          ],
          structuredContent: { status: "pending", approval_id: r.approvalId },
        };
      } catch (err) {
        if (err instanceof LetterNotWaiting) return text({ revised: false, why: err.message });
        return text({ revised: false, why: err instanceof Error ? err.message : "I couldn't change the letter." });
      }
    },
  }),
];
