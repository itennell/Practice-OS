// The Referrals calendar for Aeon (chat and MCP), spread into TOOLS in tools.ts:
// plan a coffee, call, meeting or lunch talk with someone on her board, and read
// what is planned. Planning never writes the calendar itself: it proposes a time from
// her open slots (lib/referrals/meetings.ts findOpenSlots) and queues one
// referral_meeting approval; only its executor (lib/executors/referral_meeting.ts)
// saves the meeting, once she approves, or at once when her mode runs this kind
// (Bypass). The tool then reports what really happened (meetingOutcome). Nothing is
// sent to the partner.
import { z } from "zod";
import { approvalOutcome, queueApprovalOnce, type ApprovalOutcome } from "../approvals";
import { practiceTimeZone, practiceToday } from "../compliance/store";
import { checkNote, isDay, screenedNote } from "../referrals/contacts";
import {
  addDays,
  busyBetween,
  daysRange,
  DEFAULT_MINUTES,
  findOpenSlots,
  listMeetings,
  MEETING_KINDS,
  MEETING_LABEL,
  meetingBlocked,
  meetingLabel,
  MeetingError,
  PAST_TIME,
  pendingPlans,
  type MeetingKind,
} from "../referrals/meetings";
import { listSources } from "../referrals/store";
import { ASK_WHICH, choiceOf, noCard, resolveCard } from "./tools-referrals";
import type { AeonTool, ToolContext, ToolResult } from "./tools";

const text = (value: unknown): ToolResult => ({ content: [{ type: "text", text: JSON.stringify(value, null, 2) }] });
const refuse = (why: string, extra: Record<string, unknown> = {}): ToolResult => text({ queued: false, why, ...extra });

/** How far ahead Aeon looks for a time when she names no days: the next two weeks. */
export const LOOK_AHEAD_DAYS = 14;

const DAY = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "a date like 2026-11-09");

type PlanInput = {
  partner: string;
  kind: MeetingKind;
  minutes?: number;
  starts_at?: string;
  from?: string;
  to?: string;
  location?: string;
  notes?: string;
};

/** The days to look in: hers, else tomorrow through two weeks out, in her zone. */
async function lookIn(input: { from?: string; to?: string }) {
  const tz = await practiceTimeZone();
  const today = await practiceToday();
  const fromDay = input.from ?? addDays(today, 1);
  const toDay = input.to ?? addDays(fromDay, LOOK_AHEAD_DAYS - 1);
  if (!isDay(fromDay) || !isDay(toDay)) throw new MeetingError("Pick real days, written like 2026-11-09.");
  if (toDay < fromDay) throw new MeetingError("The last day has to be on or after the first.");
  return { tz, today, fromDay, toDay, range: daysRange(fromDay < today ? today : fromDay, toDay, tz) };
}

type Planned = {
  approval_id: string;
  created: boolean;
  proposed: { with: string; kind: string; when: string; minutes: number; location: string | null };
  also_open: string[];
};

/**
 * The tool's answer from the approval's real state: booked (her mode ran it, with the time),
 * waiting for her OK, or failed. Never "waiting" for a meeting already on her calendar.
 */
export function meetingOutcome(o: ApprovalOutcome | null, p: Planned): ToolResult {
  const sent = "nothing: she tells them herself";
  if (o?.status === "done") {
    return text({
      booked: true,
      on_her_calendar: true,
      waiting_for_her: false,
      ran_on_its_own: o.ran_on_its_own,
      approval_id: p.approval_id,
      meeting: p.proposed,
      sent,
      say:
        o.result_note ??
        `${p.proposed.kind} with ${p.proposed.with} is on her Referrals calendar for ${p.proposed.when}.`,
      about:
        "Her approval mode let this run without her tap, so it is ALREADY on her Referrals calendar. Say it is booked, with the time. " +
        "Never say it is waiting for her OK or in her Approvals.",
    });
  }
  if (o?.status === "running") {
    // Her mode started it and it hasn't finished: neither booked nor waiting for her.
    return text({
      booked: false,
      being_saved: true,
      waiting_for_her: false,
      approval_id: p.approval_id,
      meeting: p.proposed,
      sent,
      say: `${p.proposed.kind} with ${p.proposed.with} for ${p.proposed.when} is being saved; check the Referrals calendar in a moment.`,
      about: "It is being saved now under her approval mode. Never say it is waiting for her OK.",
    });
  }
  if (o?.status === "failed" || o?.status === "rejected") {
    return text({ ok: false, booked: false, waiting_for_her: false, approval_id: p.approval_id, error: o.error ?? "The meeting couldn't be saved." });
  }
  return text({
    queued: true,
    booked: false,
    waiting_for_her: true,
    approval_id: p.approval_id,
    ...(p.created ? {} : { already_waiting: true }),
    proposed: p.proposed,
    also_open: p.also_open,
    where: "her Approvals",
    sent,
  });
}

export const MEETING_TOOLS: AeonTool[] = [
  {
    name: "plan_referral_meeting",
    title: "Plan a meeting with a referral partner",
    description:
      "When she wants to set up a coffee, call, meeting or lunch talk with someone on her Referrals board ('set up coffee with Quillmere next " +
      "week'): finds the card, picks the first open time still ahead in her office hours (her open days, 9 to 5 unless she saved other hours, in her " +
      "time zone, skipping meetings already planned) or checks the time she named, and puts it in her approvals. Nothing goes on her calendar until she approves (unless her mode runs it at once: then the result " +
      "says booked: true and it is ALREADY on her calendar; say so, with the time, never that it waits), and nothing is sent: " +
      "she tells the partner herself. Pass starts_at only for a time she said (ISO with offset, like 2026-11-05T10:00:00-06:00); otherwise pass " +
      "from/to days if she named them. Tell her the proposed time and the other open times in `also_open`. Notes are about the meeting (where, " +
      "what to bring), never about a client. Name the card as she said it or pass its id; several matches come back as ask_which: list them and ask which.",
    input: {
      partner: z.string().trim().min(2).max(160).describe("The card's name as she said it ('Quillmere Oncology', 'Hollis Vance'), or its id."),
      kind: z.enum(MEETING_KINDS).describe("coffee, call, meeting, lunch_talk (a talk for their staff over lunch) or other."),
      minutes: z.number().int().min(10).max(240).optional().describe("How long, if she said. Default: coffee 45, call 20, meeting 60, lunch talk 60, other 30."),
      starts_at: z.string().trim().max(40).optional().describe("Only a time she named, ISO 8601 with offset. Leave out to let plain code pick an open slot."),
      from: DAY.optional().describe("First day to look, if she named one (YYYY-MM-DD)."),
      to: DAY.optional().describe("Last day to look, if she named one (YYYY-MM-DD)."),
      location: z.string().trim().min(1).max(200).optional().describe("Where, if she said ('their office', 'Zoom', 'Bean There Cafe')."),
      notes: z.string().trim().min(1).max(500).optional().describe("Her note about the meeting itself. Never a client detail."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    label: "Planned a referral meeting",
    // Only queues an approval; the executor saves the meeting once she approves (or her mode runs it).
    changesData: false,
    run: (async (input: PlanInput, ctx: ToolContext) => {
      const found = resolveCard(input.partner, await listSources());
      if ("none" in found) return refuse(noCard(input.partner));
      if ("ask_which" in found) return refuse(ASK_WHICH, { ask_which: found.ask_which.map(choiceOf) });
      const card = found.card;
      const blocked = await meetingBlocked(card);
      if (blocked) return refuse(blocked);
      // The place and the note are free text: both pass the crisis, referral-value and privacy checks.
      for (const said of [input.location, input.notes]) {
        if (!said) continue;
        const refused = await checkNote(said, undefined, { by: "aeon" });
        if (refused) return refuse(refused);
      }
      const minutes = input.minutes ?? DEFAULT_MINUTES[input.kind];
      const now = new Date();
      let look;
      try {
        look = await lookIn(input);
      } catch (e) {
        return refuse(e instanceof Error ? e.message : String(e));
      }
      const pending = await pendingPlans(look.range);
      const { slots } = await findOpenSlots(look.range, minutes, undefined, { limit: 4, alsoBusy: pending, now });

      let start: Date;
      let end: Date;
      if (input.starts_at) {
        start = new Date(input.starts_at);
        if (Number.isNaN(start.getTime()) || !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(input.starts_at)) return refuse("I couldn't read that time. Pass it with its offset, like 2026-11-05T10:00:00-06:00.");
        if (start.getTime() <= now.getTime()) return refuse(PAST_TIME, { also_open: slots.map((s) => meetingLabel(s.start, look.tz)) });
        end = new Date(start.getTime() + minutes * 60_000);
        const near = { from: new Date(start.getTime() - 86_400_000), to: new Date(end.getTime() + 86_400_000) };
        const busy = [...(await busyBetween(near)), ...(await pendingPlans(near))];
        if (busy.some((b) => start < b.end && b.start < end)) {
          return refuse(`Something is already planned at ${meetingLabel(start, look.tz)}.`, { also_open: slots.map((s) => meetingLabel(s.start, look.tz)) });
        }
      } else {
        if (!slots.length) return refuse(`No open ${minutes}-minute time in her office hours from ${look.fromDay} to ${look.toDay}. Ask her for other days or a time.`);
        ({ start, end } = slots[0]);
      }

      const when = meetingLabel(start, look.tz);
      const title = `${MEETING_LABEL[input.kind]} with ${card.name}, ${when}`.slice(0, 200);
      const payload = {
        referral_source_id: card.id,
        kind: input.kind,
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        location: input.location ?? null,
        notes: input.notes ?? null,
        plan_key: `${card.id}:${input.kind}:${start.toISOString()}`,
      };
      const preview = {
        body: `${MEETING_LABEL[input.kind]} with ${card.name}, ${when} (${minutes} minutes)${input.location ? ` at ${input.location}` : ""}. Approving puts it on your Referrals calendar. Nothing is sent: let them know yourself.`,
        provider: card.name,
        kind: input.kind,
        starts_at: payload.starts_at,
        ends_at: payload.ends_at,
        location: payload.location,
        notes: payload.notes,
      };
      const { id, created } = await queueApprovalOnce({ kind: "referral_meeting", title, preview, payload, createdBy: ctx.by }, { payloadField: "plan_key", value: payload.plan_key });
      // Her mode may have run it already (Bypass runs this kind): say what really happened.
      return meetingOutcome(await approvalOutcome(id), {
        approval_id: id,
        created,
        proposed: { with: card.name, kind: MEETING_LABEL[input.kind], when, minutes, location: input.location ?? null },
        also_open: slots.filter((s) => s.start.getTime() !== start.getTime()).slice(0, 3).map((s) => meetingLabel(s.start, look.tz)),
      });
    }) as never,
  },
  {
    name: "list_referral_meetings",
    title: "List planned referral meetings",
    description:
      "Her Referrals calendar: the coffees, calls, meetings and lunch talks planned with people on her board, earliest first. By default today " +
      "through two weeks out; pass from/to (YYYY-MM-DD) for other days, and partner to see one card's meetings. Canceled ones only with include_canceled.",
    input: {
      from: DAY.optional().describe("First day (YYYY-MM-DD). Default today."),
      to: DAY.optional().describe("Last day (YYYY-MM-DD). Default two weeks after the first."),
      partner: z.string().trim().min(2).max(160).optional().describe("Only this card's meetings: its name as she said it, or its id."),
      include_canceled: z.boolean().optional(),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    label: "Checked your referral meetings",
    changesData: false,
    run: (async (input: { from?: string; to?: string; partner?: string; include_canceled?: boolean }) => {
      const tz = await practiceTimeZone();
      const fromDay = input.from ?? (await practiceToday());
      const toDay = input.to ?? addDays(fromDay, LOOK_AHEAD_DAYS - 1);
      if (!isDay(fromDay) || !isDay(toDay) || toDay < fromDay) return text({ meetings: [], why: "Pick real days, the first on or before the last, like 2026-11-09." });
      let sourceId: string | null = null;
      if (input.partner) {
        const found = resolveCard(input.partner, await listSources());
        if ("none" in found) return text({ meetings: [], why: noCard(input.partner) });
        if ("ask_which" in found) return text({ meetings: [], why: ASK_WHICH, ask_which: found.ask_which.map(choiceOf) });
        sourceId = found.card.id;
      }
      let rows;
      try {
        rows = await listMeetings(daysRange(fromDay, toDay, tz), { includeCanceled: input.include_canceled });
      } catch (e) {
        return text({ meetings: [], why: e instanceof Error ? e.message : String(e) });
      }
      const meetings = [];
      for (const m of rows.filter((r) => !sourceId || r.source_id === sourceId)) {
        meetings.push({
          id: m.id,
          with: m.source_name,
          kind: MEETING_LABEL[m.kind],
          when: meetingLabel(m.starts_at, tz),
          minutes: Math.round((new Date(m.ends_at).getTime() - new Date(m.starts_at).getTime()) / 60_000),
          // Her place and note, screened again before they reach the model.
          location: await screenedNote(m.location),
          notes: await screenedNote(m.notes),
          status: m.status,
          is_sample: m.is_sample,
        });
      }
      return text({ from: fromDay, to: toDay, time_zone: tz, meetings, ...(meetings.length ? {} : { none: "Nothing planned on those days." }) });
    }) as never,
  },
];
