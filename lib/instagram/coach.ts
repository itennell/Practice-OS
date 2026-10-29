// Instagram as a content coach: post ideas from her marketing answers, a weekly
// plan at her posts a week, and one idea turned into a full draft. Needs no relay
// or Meta app; posting stays optional (lib/instagram/publish.ts, only with her own
// relay). Muse writes the ideas; plain code checks every one before she sees it:
// only her topics, the post critic's rules (logistics only, no advice, no client
// stories, no testimonials, no promises), suicide or self-harm blocks the whole
// batch, and a suggested picture that names something she never shows is replaced.
//
// Ideas are practice_os.posts rows with status 'idea' (no migration): headline is
// the hook, alt_text the picture, caption the outline, and critic.idea holds the
// batch, its number and the parts, so "draft the second one" finds idea 2 of her
// latest list even though chat history keeps only text.
import { audit } from "../audit";
import { chat as metaChat } from "../meta";
import { db } from "../db";
import { codeCritic, type ChatFn } from "./critic";
import { neverShowHits } from "./never-show";
import { loadInstagramPrefs, type InstagramPrefs } from "./onboarding";
import { PILLAR_BY_ID, PILLARS, type PillarId } from "./pillars";
import { DECLINED, practiceFacts, requestPost, weekOf, type RequestResult, type SavedPost } from "./store";
import type { GraphicDeps } from "./graphic";
import { voiceLines, type PracticeFacts } from "./write";

export type Idea = { topic: PillarId; hook: string; points: string[]; cta: string; picture: string };
export type SavedIdea = Idea & { id: string; number: number; day: string | null; draftedPost?: string };

export type IdeasResult = {
  ideas: SavedIdea[];
  /** Ideas Muse wrote that broke a rule and were left out (fixed ones took their place). */
  dropped: number;
  /** Muse wrote something about suicide or self-harm: none of its ideas were used. */
  blocked: boolean;
  source: "muse" | "fixed";
  sample: boolean;
  /** She said Instagram isn't for her. */
  declined: boolean;
};

// ---- never-show ---------------------------------------------------------------------

/** A safe picture for each topic that shows none of the never-show things. */
export const NEUTRAL_PICTURE: Record<PillarId, string> = {
  first_session: "A calm illustration of a notebook, a pen and a cup of tea.",
  fees_superbills: "A simple illustration of a calculator, a folder and a receipt.",
  how_to_book: "A calendar page with one day circled, in soft colors.",
  meet_the_clinician: "A bookshelf with a plant, in soft morning light.",
  office_telehealth: "A laptop showing a video call window, next to a plant.",
};

/** Whether a picture idea shows something she never shows (her first name counts as her face). */
export function breaksNeverShow(picture: string, neverShow: string[], firstName?: string): boolean {
  return neverShowHits(picture, neverShow, { firstName }).length > 0;
}

// ---- the fixed ideas (no Muse key, or Muse's broke the rules) ---------------------------
// Only facts she gave Aeon (her name, license, where she practices, her fee list);
// anything else is a [fill in] for her to finish, never a made-up detail.

const FILL = (what: string) => `[fill in: ${what}]`;

export function fixedIdeas(f: Pick<PracticeFacts, "clinicianName" | "credential" | "neighborhood" | "city" | "fees">): Record<PillarId, Omit<Idea, "picture">> {
  const where = [f.neighborhood, f.city].filter(Boolean).join(", ") || FILL("where you see clients");
  const fee = f.fees[0];
  const money = (c: number) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`;
  const book = `To book: ${FILL("how people book with you")}.`;
  return {
    first_session: {
      topic: "first_session",
      hook: "Wondering what your first session looks like?",
      points: [`How long it lasts: ${FILL("length")}.`, "We go over a few forms and what you're looking for.", "You can ask any questions about how it works."],
      cta: book,
    },
    fees_superbills: {
      topic: "fees_superbills",
      hook: "Here's how paying for sessions works.",
      points: [fee ? `${fee.label}: ${money(fee.cents)}.` : `My fee: ${FILL("your fee")}.`, `Insurance: ${FILL("superbills or the plans you take")}.`],
      cta: `Questions about cost? ${book}`,
    },
    how_to_book: {
      topic: "how_to_book",
      hook: "Here's how to book a first visit.",
      points: [`Step 1: ${FILL("first step")}.`, `Step 2: ${FILL("next step")}.`],
      cta: book,
    },
    meet_the_clinician: {
      topic: "meet_the_clinician",
      hook: "A little about who you'd be working with.",
      points: [`I'm ${f.clinicianName}, ${f.credential}.`, `I see clients in ${where}.`, `Who I work with: ${FILL("who you help")}.`],
      cta: book,
    },
    office_telehealth: {
      topic: "office_telehealth",
      hook: "Where we meet.",
      points: [`The office: ${where}.`, `Video sessions: ${FILL("whether you offer them, and where")}.`],
      cta: book,
    },
  };
}

// ---- Muse --------------------------------------------------------------------------

function schema(topics: PillarId[], count: number) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["ideas"],
    properties: {
      ideas: {
        type: "array",
        minItems: count,
        maxItems: count,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["topic", "hook", "points", "call_to_action", "picture"],
          properties: {
            topic: { type: "string", enum: topics },
            hook: { type: "string", description: "The opening line, at most 100 characters, plain 6th-grade words." },
            points: { type: "array", minItems: 2, maxItems: 3, items: { type: "string", description: "One short fact, at most 120 characters." } },
            call_to_action: { type: "string", description: "What to do next, like how to book. At most 100 characters." },
            picture: { type: "string", description: "A suggested picture in one sentence. No text in the picture." },
          },
        },
      },
    },
  };
}

function prompt(f: PracticeFacts, prefs: InstagramPrefs, topics: PillarId[], count: number): string {
  const never = prefs.neverShow.length ? `The picture must never show: ${prefs.neverShow.join(", ")} (a face means any photo of her).` : "";
  return [
    `Suggest ${count} Instagram post ideas for this week for ${f.practiceName}, the private practice of ${f.clinicianName}, ${f.credential}, in ${[f.neighborhood, f.city].filter(Boolean).join(", ")}. This is a fictional demo practice.`,
    "Each idea: a hook (the opening line), 2 or 3 short points, a call to action such as how to book, and a suggested picture.",
    "Practice logistics ONLY. Never: mental health advice, coping tips, symptoms, therapy techniques, any client story (real or made up), testimonials or reviews, promises of results, prices, or anything about suicide, self-harm or crisis.",
    `Use only these topics, spreading the ideas across them: ${topics.map((t) => `"${t}" (${PILLAR_BY_ID.get(t)!.label}: ${PILLAR_BY_ID.get(t)!.brief})`).join("; ")}.`,
    never,
    ...voiceLines(f.voice),
  ]
    .filter(Boolean)
    .join("\n");
}

type Checked = { kept: Idea[]; dropped: number; blocked: boolean };

/** Plain code decides: her topics only, the post rules, and her never-show list. */
export function checkIdeas(raw: unknown[], opts: { topics: PillarId[]; neverShow: string[]; firstName?: string; feesCents: number[] }): Checked {
  const kept: Idea[] = [];
  let dropped = 0;
  for (const r of raw) {
    const x = (r ?? {}) as Record<string, unknown>;
    const points = Array.isArray(x.points) ? x.points.filter((p): p is string => typeof p === "string" && p.trim().length > 0).map((p) => p.trim().slice(0, 160)) : [];
    const idea = {
      topic: x.topic as PillarId,
      hook: typeof x.hook === "string" ? x.hook.trim().slice(0, 120) : "",
      points: points.slice(0, 3),
      cta: typeof x.call_to_action === "string" ? x.call_to_action.trim().slice(0, 120) : "",
      picture: typeof x.picture === "string" ? x.picture.trim().slice(0, 200) : "",
    };
    const words = [idea.hook, ...idea.points, idea.cta, idea.picture].join("\n");
    const critic = codeCritic(words, { licenseLine: "", feesCents: opts.feesCents });
    if (critic.hardStop) return { kept: [], dropped: raw.length, blocked: true };
    const broken = critic.findings.some((f) => f.rule !== "license_line");
    if (!opts.topics.includes(idea.topic) || !idea.hook || idea.points.length < 2 || !idea.cta || broken) {
      dropped++;
      continue;
    }
    if (!idea.picture || breaksNeverShow(idea.picture, opts.neverShow, opts.firstName)) idea.picture = NEUTRAL_PICTURE[idea.topic];
    kept.push(idea);
  }
  return { kept, dropped, blocked: false };
}

/** Her topics in the usual order, repeated to fill `count`, for the fixed ideas. */
function fill(kept: Idea[], topics: PillarId[], count: number, f: PracticeFacts): Idea[] {
  const fixed = fixedIdeas(f);
  const fixedIdea = (topic: PillarId): Idea => ({ ...fixed[topic], picture: NEUTRAL_PICTURE[topic] });
  const out = kept.slice(0, count);
  const order = PILLARS.map((p) => p.id).filter((id) => topics.includes(id));
  for (let i = 0; out.length < count && order.length; i++) {
    const unused = order.find((t) => !out.some((o) => o.topic === t));
    out.push(fixedIdea(unused ?? order[i % order.length]));
  }
  return out;
}

export async function writeIdeas(
  f: PracticeFacts,
  prefs: InstagramPrefs,
  opts: { count: number; topics: PillarId[]; chat?: ChatFn; hasKey?: boolean },
): Promise<{ ideas: Idea[]; dropped: number; blocked: boolean; source: "muse" | "fixed" }> {
  // A chat passed in (tests, a replayed conversation) counts as a key.
  const hasKey = opts.hasKey ?? (Boolean(opts.chat) || Boolean(process.env.MODEL_API_KEY));
  const check = { topics: opts.topics, neverShow: prefs.neverShow, firstName: f.clinicianName.split(" ")[0], feesCents: f.fees.map((x) => x.cents) };
  if (!hasKey) return { ideas: fill([], opts.topics, opts.count, f), dropped: 0, blocked: false, source: "fixed" };
  try {
    const res = await (opts.chat ?? metaChat)("instagram.ideas", {
      messages: [{ role: "user", content: prompt(f, prefs, opts.topics, opts.count) }],
      response_format: { type: "json_schema", json_schema: { name: "post_ideas", schema: schema(opts.topics, opts.count) as never } },
    });
    const parsed = JSON.parse(res.choices[0]?.message.content ?? "{}") as { ideas?: unknown[] };
    const c = checkIdeas(parsed.ideas ?? [], check);
    if (c.blocked) {
      await audit({ actor: "aeon", action: "instagram_ideas_blocked", subjectType: "post", details: { rule: "self_harm" } });
      return { ideas: fill([], opts.topics, opts.count, f), dropped: c.dropped, blocked: true, source: "fixed" };
    }
    return { ideas: fill(c.kept, opts.topics, opts.count, f), dropped: c.dropped, blocked: false, source: c.kept.length ? "muse" : "fixed" };
  } catch (err) {
    await audit({ actor: "system", action: "instagram_ideas_fallback", subjectType: "post", details: { error: err instanceof Error ? err.message : String(err) } });
    return { ideas: fill([], opts.topics, opts.count, f), dropped: 0, blocked: false, source: "fixed" };
  }
}

// ---- saving and reading ideas ------------------------------------------------------------

const outline = (i: Idea) => [i.hook, ...i.points.map((p) => `- ${p}`), i.cta].join("\n");

async function isSample(): Promise<boolean> {
  const [p] = await db()<{ is_sample: boolean }[]>`select is_sample from practice_os.clinician_profile limit 1`;
  return Boolean(p?.is_sample);
}

/** Days for her posts a week: 1 = Tuesday, 3 = Mon/Wed/Fri, 5 = Mon-Fri, the next of each from `today`. */
export function planDays(perWeek: 1 | 3 | 5, today: string): string[] {
  const weekdays = { 1: [2], 3: [1, 3, 5], 5: [1, 2, 3, 4, 5] }[perWeek];
  const start = new Date(`${today}T12:00:00Z`);
  return weekdays
    .map((wd) => {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + ((wd - d.getUTCDay() + 7) % 7));
      return d.toISOString().slice(0, 10);
    })
    .sort();
}

async function saveIdeas(ideas: Idea[], days: (string | null)[], sample: boolean, timezone: string): Promise<SavedIdea[]> {
  const batch = crypto.randomUUID();
  const out: SavedIdea[] = [];
  await db().begin(async (tx) => {
    for (const [n, idea] of ideas.entries()) {
      const day = days[n] ?? null;
      const meta = { idea: { batch, number: n + 1, points: idea.points, cta: idea.cta } };
      const [row] = await tx<{ id: string }[]>`
        insert into practice_os.posts (topic, caption, headline, alt_text, status, critic, week_of, scheduled_for, is_sample, created_at)
        values (${idea.topic}, ${outline(idea)}, ${idea.hook.slice(0, 80)}, ${idea.picture}, 'idea', ${tx.json(meta as never)},
                ${weekOf(day ? new Date(`${day}T12:00:00`) : new Date())},
                ${day ? tx`(${day}::date + time '09:00') at time zone ${timezone}` : null}, ${sample},
                now() + ${n} * interval '1 millisecond')
        returning id`;
      out.push({ ...idea, id: row.id, number: n + 1, day });
    }
  });
  return out;
}

export async function postIdeas(
  by: string,
  opts: { count?: number; topic?: PillarId; plan?: boolean; chat?: ChatFn; hasKey?: boolean; today?: string } = {},
): Promise<IdeasResult> {
  const [prefs, facts, sample] = await Promise.all([loadInstagramPrefs(), practiceFacts(), isSample()]);
  // She said Instagram isn't for her: no ideas, no plan, no model call.
  if (prefs.account === "no") return { ideas: [], dropped: 0, blocked: false, source: "fixed", sample, declined: true };
  const topics = opts.topic ? [opts.topic] : prefs.topics;
  const count = opts.plan ? prefs.postsPerWeek : Math.min(5, Math.max(1, opts.count ?? Math.min(prefs.postsPerWeek, 3)));
  const w = await writeIdeas(facts, prefs, { count, topics, chat: opts.chat, hasKey: opts.hasKey });
  const [s] = await db()<{ timezone: string }[]>`select timezone from practice_os.settings limit 1`;
  const timezone = s?.timezone ?? "America/Chicago";
  const today = opts.today ?? new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
  const days = opts.plan ? planDays(prefs.postsPerWeek, today) : [];
  const ideas = await saveIdeas(w.ideas, days, sample, timezone);
  await audit({ actor: "aeon", action: opts.plan ? "instagram_weekly_plan" : "instagram_ideas", subjectType: "post", details: { by, count: ideas.length, source: w.source, dropped: w.dropped } });
  return { ideas, dropped: w.dropped, blocked: w.blocked, source: w.source, sample, declined: false };
}

type IdeaRow = { id: string; topic: PillarId; headline: string; alt_text: string; critic: { idea?: { batch: string; number: number; points: string[]; cta: string; drafted_post?: string } }; scheduled_for: Date | null };

function toSaved(r: IdeaRow): SavedIdea {
  const meta = r.critic.idea!;
  return { id: r.id, number: meta.number, topic: r.topic, hook: r.headline, points: meta.points, cta: meta.cta, picture: r.alt_text, day: r.scheduled_for ? r.scheduled_for.toISOString().slice(0, 10) : null, draftedPost: meta.drafted_post };
}

/** Her latest list of ideas, in order (what "the second one" means). */
export async function latestIdeas(): Promise<SavedIdea[]> {
  const rows = await db()<IdeaRow[]>`
    select id, topic, headline, alt_text, critic, scheduled_for from practice_os.posts
     where status = 'idea' and critic -> 'idea' ->> 'batch' = (
       select critic -> 'idea' ->> 'batch' from practice_os.posts where status = 'idea' order by created_at desc limit 1)
     order by (critic -> 'idea' ->> 'number')::int`;
  return rows.map(toSaved);
}

async function findIdea(ref: { number?: number; id?: string }): Promise<SavedIdea | null> {
  if (ref.id) {
    const [r] = await db()<IdeaRow[]>`
      select id, topic, headline, alt_text, critic, scheduled_for from practice_os.posts where id = ${ref.id} and status = 'idea'`;
    return r ? toSaved(r) : null;
  }
  return (await latestIdeas()).find((i) => i.number === ref.number) ?? null;
}

export type DraftIdeaResult =
  | { found: false; why: string }
  | ({ found: true; idea: SavedIdea } & RequestResult)
  /** She asked for the same idea again: the draft she already has, not a second approval. */
  | { found: true; idea: SavedIdea; outcome: "already_drafted"; post: SavedPost; headline: string; why: null };

/** One idea as a full caption in her style: checked, drawn and waiting for her approval like any post. */
export async function draftIdea(by: string, ref: { number?: number; id?: string }, opts: { chat?: ChatFn; graphic?: GraphicDeps } = {}): Promise<DraftIdeaResult> {
  const idea = await findIdea(ref);
  if (!idea) return { found: false, why: ref.id ? "No idea with that id." : `Her latest list has no idea number ${ref.number}. Offer to make new ideas.` };
  if (idea.draftedPost) {
    const [p] = await db()<{ id: string; approval_id: string | null; status: string; headline: string | null }[]>`
      select id, approval_id, status, headline from practice_os.posts where id = ${idea.draftedPost} and status <> 'blocked'`;
    if (p) {
      return {
        found: true,
        idea,
        outcome: "already_drafted",
        post: { id: p.id, approvalId: p.approval_id, status: p.status as SavedPost["status"] },
        headline: p.headline ?? idea.hook,
        why: null,
      };
    }
  }
  const request = [`Write the full post from this idea.`, `Hook: ${idea.hook}`, ...idea.points.map((p) => `Point: ${p}`), `Call to action: ${idea.cta}`].join("\n");
  const r = await requestPost(by, request, idea.topic, opts);
  if ("post" in r) {
    await db()`
      update practice_os.posts set critic = jsonb_set(critic, '{idea,drafted_post}', to_jsonb(${r.post.id}::text), true) where id = ${idea.id}`;
  }
  return { found: true, idea, ...r };
}

export const ideasForModel = (r: IdeasResult) =>
  r.declined ? { written: false, why: DECLINED } : ideasList(r);

const ideasList = (r: IdeasResult) => ({
  ...(r.sample ? { label: "Show [Sample] before each idea: this is the fictional demo practice." } : {}),
  ...(r.blocked ? { note_blocked: "Some ideas touched a topic posts never cover, so safe fixed ideas are shown instead." } : {}),
  ideas: r.ideas.map((i) => ({
    number: i.number,
    ...(i.day ? { day: i.day } : {}),
    topic: PILLAR_BY_ID.get(i.topic)!.label,
    hook: `${r.sample ? "[Sample] " : ""}${i.hook}`,
    points: i.points,
    call_to_action: i.cta,
    picture: i.picture,
  })),
  next: "Ask which one to write. Draft only the one she picks, with draft_post and its number.",
});
