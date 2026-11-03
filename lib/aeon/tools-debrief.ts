// "Debrief my coffee with Dr. X" in the chat: finds the partner's card and hands
// her a card that opens the recorder on it (Referrals, the card's Debrief
// button). The recording, privacy pass and review all happen there
// (lib/referrals/debrief.ts): Aeon never hears the audio or the transcript, and
// nothing is saved until she confirms the review card.
import { z } from "zod";
import type { DocumentCard } from "../documents/card";
import { listSources } from "../referrals/store";
import { ASK_WHICH, choiceOf, noCard, resolveCard } from "./tools-referrals";
import type { AeonTool, ToolResult } from "./tools";

const text = (value: unknown): ToolResult => ({ content: [{ type: "text", text: JSON.stringify(value, null, 2) }] });

export const DEBRIEF_TOOLS: AeonTool[] = [
  {
    name: "debrief_meeting",
    title: "Debrief a coffee meeting with a referral partner",
    description:
      "When she wants to debrief a meeting, coffee or call with someone on her Referrals board ('debrief my coffee with Dr. Okafor'): finds the " +
      "card and returns a card that opens the Debrief recorder on it. She records up to 3 minutes of what she learned; plain code takes out " +
      "anything about their patients, Aeon fills in how they refer, who to ask for, who they serve and who else to meet, and she confirms it " +
      "before anything is saved. Then a follow-up email waits in her approvals; she sends it herself. Say the card is under your answer; don't " +
      "ask her to tell you the details in the chat. Name the card as she said it or pass its id; several matches come back as ask_which: list " +
      "them (name, address) and ask which. Sends nothing.",
    input: { partner: z.string().trim().min(2).max(160).describe("The card's name as she said it ('Dr. Okafor', 'Lakeview Pediatrics'), or its id.") },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    label: "Opened a debrief",
    changesData: true,
    run: (async ({ partner }: { partner: string }) => {
      const found = resolveCard(partner, await listSources());
      if ("none" in found) return text({ opened: false, why: noCard(partner) });
      if ("ask_which" in found) return text({ opened: false, why: ASK_WHICH, ask_which: found.ask_which.map(choiceOf) });
      const c = found.card;
      const card: DocumentCard = {
        id: `referral_debrief:${c.id}`,
        kind: "referral_debrief",
        title: `Debrief with ${c.name}`.slice(0, 160),
        subtitle: "Record up to 3 minutes. Patient details are left out; you confirm everything before it's saved.",
        status: "Ready to record",
        due_on: null,
        payer: null,
        topics: ["debrief", "coffee", "referral"],
        open: `/referrals?debrief=${c.id}`,
        pdf: null,
        source: null,
        needs_her: "Press Record and talk about how they refer, who to ask for and who they serve. Leave out their patients.",
        held_elsewhere: null,
        is_sample: c.is_sample,
      };
      return {
        content: [{ type: "text", text: JSON.stringify({ opened: true, name: c.name, card: "under your answer: it opens the Debrief recorder on their card" }, null, 2) }],
        structuredContent: { documents: [card] },
      };
    }) as never,
  },
];
