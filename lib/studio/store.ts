// The studio's projects, edit history and pictures (migrations 026-028), and the
// two ways a document changes: Aeon makes one from what she typed (research,
// write, picture, slides; each step reported as it happens), and an edit (from
// chat or the canvas) is validated, safety-checked and saved as one step. Undo
// and Redo move the project's cursor through the steps.
import { guard, REFUSAL } from "../aeon/guard";
import { queueApproval } from "../approvals";
import { audit } from "../audit";
import { db } from "../db";
import type { ChatFn } from "../instagram/critic";
import { designPost, type GraphicDeps } from "../instagram/graphic";
import { instagramDeclined, loadInstagramPrefs } from "../instagram/onboarding";
import { PILLAR_BY_ID, type PillarId } from "../instagram/pillars";
import { checkReel, draftReel, REEL_SECONDS } from "../instagram/reel";
import type { Research, ResearchAngle, SearchFn } from "../instagram/research";
import { checkRequest, DECLINED, practiceFacts, requestPost, researchPost } from "../instagram/store";
import type { Angle } from "../instagram/topic-gate";
import { criticContext } from "../instagram/write";
import { alertCrisis, checkCrisis, CRISIS_REPLY } from "../safety";
import { checkStep, pictureIdeaProblems, type Limits } from "./check";
import { emptyDoc, LIMITS, parseDoc, type Kind, type StudioDoc } from "./doc";
import { proposeEdit } from "./edit";
import { applyOps, describeOp, OpSchema } from "./ops";

export type Step = { seq: number; source: "chat" | "canvas" | "aeon"; summary: string; at: string };
export type Project = {
  id: string;
  postId: string | null;
  doc: StudioDoc;
  cursor: number;
  steps: Step[];
  canRedo: boolean;
  postStatus: string | null;
  approvalId: string | null;
  approvalStatus: string | null;
  isSample: boolean;
  updatedAt: string;
};

type Row = { id: string; post_id: string | null; doc: unknown; cursor: number; is_sample: boolean; updated_at: Date; post_status: string | null; approval_id: string | null; approval_status: string | null };

export async function getProject(id: string): Promise<Project | null> {
  const [row] = await db()<Row[]>`
    select s.id, s.post_id, s.doc, s.cursor, s.is_sample, s.updated_at, p.status as post_status, p.approval_id, a.status as approval_status
      from practice_os.studio_projects s left join practice_os.posts p on p.id = s.post_id
      left join practice_os.approvals a on a.id = p.approval_id
     where s.id = ${id}`;
  if (!row) return null;
  const doc = parseDoc(row.doc);
  if (!doc) return null;
  const steps = await db()<{ seq: number; source: Step["source"]; summary: string; created_at: Date }[]>`
    select seq, source, summary, created_at from practice_os.studio_steps where project_id = ${id} order by seq`;
  return {
    id: row.id,
    postId: row.post_id,
    doc,
    cursor: row.cursor,
    steps: steps.filter((s) => s.seq <= row.cursor).map((s) => ({ seq: s.seq, source: s.source, summary: s.summary, at: new Date(s.created_at).toISOString() })),
    canRedo: steps.some((s) => s.seq > row.cursor),
    postStatus: row.post_status,
    approvalId: row.approval_id,
    approvalStatus: row.approval_status,
    isSample: row.is_sample,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

/** Her recent studio projects, newest first. */
export async function listProjects(limit = 12): Promise<{ id: string; kind: Kind; title: string; updatedAt: string }[]> {
  const rows = await db()<{ id: string; doc: unknown; updated_at: Date }[]>`
    select id, doc, updated_at from practice_os.studio_projects order by updated_at desc limit ${limit}`;
  return rows.flatMap((r) => {
    const d = parseDoc(r.doc);
    return d ? [{ id: r.id, kind: d.kind, title: d.title || d.topic || "Untitled", updatedAt: new Date(r.updated_at).toISOString() }] : [];
  });
}

export async function studioPicture(id: string): Promise<Buffer | null> {
  const [row] = await db()<{ jpeg: Buffer }[]>`
    select sp.jpeg from practice_os.studio_pictures sp join practice_os.studio_projects s on s.id = sp.project_id
     where sp.project_id = ${id} and sp.version <= (s.doc->>'picture')::int
     order by sp.version desc limit 1`;
  return row ? Buffer.from(row.jpeg) : null;
}

async function limits(): Promise<Limits> {
  const [facts, prefs] = await Promise.all([practiceFacts(), loadInstagramPrefs()]);
  return { ctx: criticContext(facts), neverShow: prefs.neverShow };
}

// ---- Approved content never changes silently -------------------------------------------

/** What she sees when she edits something she already approved; Continue sends the edit again with reapprove. */
export const REAPPROVE = "Editing this will need a new approval. Continue?";
const FROZEN = "This one is being posted or is already posted, so it can't change now.";
const POSTED = new Set(["scheduled", "publishing", "published"]);

/** "frozen": being posted or posted, never changed. "approved": changing it needs a fresh approval. */
export function editLock(p: Pick<Project, "postId" | "postStatus" | "approvalStatus">): "frozen" | "approved" | null {
  if (!p.postId) return null;
  if (POSTED.has(p.postStatus ?? "") || p.approvalStatus === "running") return "frozen";
  if (p.postStatus === "ready" || p.approvalStatus === "done") return "approved";
  return null;
}

function lockRefusal(p: Project, reapprove: boolean | undefined): EditResult | null {
  const lock = editLock(p);
  if (lock === "frozen") return { ok: false, status: 409, why: FROZEN, project: p };
  if (lock === "approved" && !reapprove) return { ok: false, status: 409, why: REAPPROVE, project: p, needsReapproval: true };
  return null;
}

/**
 * Keeps the post she approves in step with the studio: the words, the reel and the picture.
 * A post waiting for her gets its approval preview updated too. An approved (ready) post is
 * changed only with `reapprove`: it goes back to waiting, and a fresh approval is queued. A
 * post being posted, posted or blocked is never changed here.
 */
async function syncPost(projectId: string, doc: StudioDoc, opts: { by: string; reapprove?: boolean }) {
  const reapprove = opts.reapprove === true;
  const reel = doc.kind === "reel" ? { slides: doc.slides.map((s) => ({ kind: s.kind, text: s.kind === "picture" ? "" : s.text })), seconds: Math.round(Math.min(20, Math.max(10, doc.slides.reduce((t, s) => t + s.seconds, 0)))) } : null;
  const [post] = await db()<{ id: string; headline: string | null; caption: string; alt_text: string | null; approval_id: string | null }[]>`
    update practice_os.posts p
       set caption = ${doc.caption}, headline = ${doc.title || null},
           reel = coalesce(${reel ? db().json(reel as never) : null}::jsonb, p.reel),
           image_jpeg = coalesce((select sp.jpeg from practice_os.studio_pictures sp where sp.project_id = ${projectId} and sp.version = ${doc.picture}), p.image_jpeg),
           status = case when ${reapprove} then 'pending_approval' else p.status end,
           approval_id = case when ${reapprove} then null else p.approval_id end
      from practice_os.studio_projects s
     where s.id = ${projectId} and p.id = s.post_id
       and (p.status in ('idea', 'draft', 'pending_approval', 'failed') or (${reapprove} and p.status = 'ready'))
       and not exists (select 1 from practice_os.approvals a where a.id = p.approval_id and a.status = 'running')
       and (${reapprove} or not exists (select 1 from practice_os.approvals a where a.id = p.approval_id and a.status = 'done'))
    returning p.id, p.headline, p.caption, p.alt_text, p.approval_id`;
  if (!post) return;
  if (!reapprove) {
    if (post.approval_id)
      await db()`
        update practice_os.approvals set preview = preview || ${db().json({ body: post.caption, headline: post.headline } as never)}
         where id = ${post.approval_id} and status = 'pending'`;
    return;
  }
  const headline = post.headline ?? "Post";
  const approvalId = await queueApproval({
    kind: "instagram_post",
    title: `Instagram post: ${headline}`,
    preview: { body: post.caption, headline, alt_text: post.alt_text, image: `/api/instagram/posts/${post.id}/image` },
    payload: { post_id: post.id },
    createdBy: opts.by,
  });
  await db()`update practice_os.posts set approval_id = ${approvalId} where id = ${post.id} and approval_id is null`;
  await audit({ actor: "clinician", action: "studio_reapproval_queued", subjectType: "post", subjectId: post.id, details: { project_id: projectId, approval_id: approvalId, by: opts.by } });
}

// ---- Making one ---------------------------------------------------------------------

/** What Aeon reports while making something, in order. The canvas fills in as these arrive. */
export type MakeEvent =
  | { type: "step"; id: string; label: string; state: "working" | "done" }
  | { type: "research"; summary: string; angles: ResearchAngle[]; source: Research["source"]; picked: number }
  | { type: "words"; title: string; caption: string }
  | { type: "project"; project: Project }
  | { type: "reply"; text: string }
  /** Her topic is advice or a story: the plain reason, plus logistics angles to pick from. Never an error. */
  | { type: "redirect"; why: string; angles: Angle[] }
  | { type: "stop"; why: string };

/** Which kind she asked for, from her words. */
export function kindOf(request: string): Kind {
  if (/\b(my|own|this) (video|footage|clip)|\bupload\b|\bedit (my|a|the) video\b/i.test(request)) return "video";
  if (/\breels?\b|\bvideo\b|\btiktok\b/i.test(request)) return "reel";
  if (/\bcarousel\b|\bslides\b|\bswipe\b/i.test(request)) return "carousel";
  return "post";
}

/** Her topic without the "make a reel about" around it, for research and the post. */
export function topicOf(request: string): string {
  const t = request
    .replace(/^\s*(please\s+)?(can you\s+|could you\s+)?(make|create|write|draft|do|plan|build|give me)\s+(me\s+)?(an?|one|some)?\s*(new\s+)?(instagram\s+)?(post|reel|carousel|video|slides?)\s*(about|on|for|explaining|showing)?\s*/i, "")
    .replace(/[.?!]+$/, "")
    .trim();
  return t.length >= 3 ? t : request.trim();
}

const STEP = {
  check: "Checking the topic",
  posts: "Looking at what therapists post",
  hooks: "Finding opening lines that work",
  formats: "Picking the best format",
  angles: "Choosing an angle",
  write: "Writing the words",
  picture: "Drawing the picture",
  slides: "Laying out the slides",
} as const;

export type MakeDeps = { chat?: ChatFn; search?: SearchFn; graphic?: GraphicDeps };

/**
 * Makes a post, carousel or reel from what she typed, reporting each step. Research
 * first, then the words, then the picture (the post waits for her approval like
 * any other), then the slides. A video starts empty: her footage comes from her
 * computer on the canvas.
 */
export async function makeProject(by: string, request: string, emit: (e: MakeEvent) => void, deps: MakeDeps = {}): Promise<Project | null> {
  const kind = kindOf(request);
  if (await instagramDeclined()) {
    emit({ type: "stop", why: DECLINED });
    return null;
  }
  if (kind === "video") {
    // Her words go through the same checks as a post topic before anything is saved:
    // the crisis check (fixed reply, alert, audit), the PHI guard, then the topic gate.
    const refused = await checkRequest(request, by);
    if (refused?.outcome === "blocked") {
      emit({ type: "stop", why: refused.why });
      return null;
    }
    if (refused?.outcome === "off_topic") {
      emit({ type: "redirect", why: refused.why, angles: refused.angles });
      return null;
    }
    const project = await createProject(emptyDoc("video", topicOf(request)), { by, source: "aeon", summary: "Started a video" });
    emit({ type: "project", project });
    emit({ type: "reply", text: "Add your video from your computer on the right. It stays on your computer; I only see the times you pick." });
    return project;
  }
  const topic = topicOf(request);
  const step = (id: keyof typeof STEP, state: "working" | "done") => emit({ type: "step", id, label: STEP[id], state });

  step("check", "working");
  (["posts", "hooks", "formats"] as const).forEach((h) => step(h, "working"));
  const r = await researchPost(by, topic, {
    chat: deps.chat,
    search: deps.search,
    onStep: ({ helper }) => {
      if (helper === "angles") step("angles", "working");
      else step(helper, "done");
    },
  });
  step("check", "done");
  if (r.outcome === "declined" || r.outcome === "blocked") {
    emit({ type: "stop", why: r.why });
    return null;
  }
  if (r.outcome === "off_topic") {
    emit({ type: "redirect", why: r.why, angles: r.angles });
    return null;
  }
  const research = r.research;
  step("angles", "done");
  // The angle whose format fits what she asked for, else the first.
  const wanted = kind === "reel" ? "reel" : kind === "carousel" ? "carousel" : "single picture";
  const picked = Math.max(0, research.angles.findIndex((a) => a.format === wanted));
  emit({ type: "research", summary: research.summary, angles: research.angles, source: research.source, picked });

  step("write", "working");
  const angle = research.angles[picked];
  const out = await requestPost(by, topic, angle?.pillar ?? null, {
    chat: deps.chat,
    graphic: deps.graphic,
    research: research.id && angle ? { id: research.id, angle: picked } : undefined,
    onWritten: (d) => {
      step("write", "done");
      emit({ type: "words", title: d.headline, caption: d.caption });
      step("picture", "working");
    },
  });
  if (out.outcome === "declined" || out.outcome === "blocked") {
    emit({ type: "stop", why: out.why });
    return null;
  }
  if (out.outcome === "off_topic") {
    emit({ type: "redirect", why: out.why, angles: out.angles });
    return null;
  }
  step("picture", "done");
  if (out.outcome === "blocked_after_rewrite") {
    emit({ type: "stop", why: `I couldn't write a safe version of that one. ${out.why}` });
    return null;
  }

  const [post] = await db()<{ id: string; headline: string | null; caption: string; image_jpeg: Buffer | null }[]>`
    select id, headline, caption, image_jpeg from practice_os.posts where id = ${out.post.id}`;
  const facts = await practiceFacts();
  const doc: StudioDoc = { ...emptyDoc(kind, topic), title: (post.headline ?? out.headline).slice(0, LIMITS.title), caption: post.caption };
  if (kind === "post") doc.slides = [{ id: "s1", kind: "picture", text: "", seconds: 3 }];
  else {
    step("slides", "working");
    const reel = await draftReel(post.caption, facts.licenseLine, { chat: deps.chat });
    const each = Math.round((15 / reel.slides.length) * 10) / 10;
    doc.slides = reel.slides.map((s, i) => ({ id: `s${i + 1}`, kind: s.kind, text: s.text.slice(0, LIMITS.slideText), seconds: Math.max(LIMITS.slideSeconds.min, each) }));
    // A carousel is pictures to swipe: no "how to book" card is forced, but it's a good last slide, so it stays.
    // Aeon's slide words get every check her own would before they're saved: the reel rules,
    // her never-show list, the topic gate on the joined slides, and Muse's critic.
    const lim = await limits();
    const shape = checkReel({ slides: doc.slides.map((s) => ({ kind: s.kind, text: s.text })), seconds: REEL_SECONDS.start }, { neverShow: lim.neverShow });
    let check;
    try {
      check = shape.length ? { ok: false as const, why: shape[0] } : await checkStep(null, doc, lim, { chat: deps.chat });
    } catch {
      emit({ type: "stop", why: "Aeon's safety check didn't answer, so the slides weren't saved. Your post is still waiting in your approvals. Try again in a minute." });
      return null;
    }
    if (!check.ok) {
      await audit({ actor: "aeon", action: "studio_slides_refused", subjectType: "post", subjectId: post.id, details: { why: check.why } });
      emit({ type: "stop", why: `I couldn't make slides that pass the safety check: ${check.why} Your post is still waiting in your approvals.` });
      return null;
    }
    step("slides", "done");
  }
  const project = await createProject(doc, {
    by,
    source: "aeon",
    summary: `Made a ${kind}`,
    postId: post.id,
    researchId: research.id,
    picture: post.image_jpeg ? Buffer.from(post.image_jpeg) : null,
  });
  emit({ type: "project", project });
  const why = out.why ? ` ${out.why}` : "";
  emit({
    type: "reply",
    text: `Here's your ${kind === "post" ? "post" : kind}: "${doc.title}".${why} Tell me what to change, or change it on the right. Nothing is posted; approve it when you like it.`,
  });
  return project;
}

async function createProject(
  doc: StudioDoc,
  opts: { by: string; source: Step["source"]; summary: string; postId?: string; researchId?: string | null; picture?: Buffer | null },
): Promise<Project> {
  const [p] = await db()<{ is_sample: boolean }[]>`select is_sample from practice_os.clinician_profile limit 1`;
  const id = await db().begin(async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      insert into practice_os.studio_projects (post_id, research_id, doc, base_doc, is_sample)
      values (${opts.postId ?? null}, ${opts.researchId ?? null}, ${tx.json(doc as never)}, ${tx.json(doc as never)}, ${p?.is_sample ?? false})
      returning id`;
    if (opts.picture) await tx`insert into practice_os.studio_pictures (project_id, version, jpeg) values (${row.id}, 0, ${opts.picture})`;
    return row.id;
  });
  await audit({ actor: "aeon", action: "studio_project_made", subjectType: "studio_project", subjectId: id, details: { kind: doc.kind, by: opts.by } });
  return (await getProject(id))!;
}

// ---- Editing --------------------------------------------------------------------------

export type EditResult =
  | { ok: true; project: Project; reply: string }
  /** needsReapproval: she approved this already; send the same change again with reapprove to go ahead. */
  | { ok: false; status: number; why: string; project?: Project; hardStop?: boolean; needsReapproval?: boolean };

/** How many edit steps a project keeps; older ones fold into base_doc. */
export const KEEP_STEPS = 50;
/** The most a document may weigh, as JSON. */
export const MAX_DOC_BYTES = 256 * 1024;
const TOO_BIG = "This has grown too big to save. Take out some captions or texts, then try again.";

/** Saves one step: the ops, the new document, and the cursor at it. Steps past the cursor (after an Undo) are dropped. */
async function saveStep(project: Project, doc: StudioDoc, ops: unknown[], source: Step["source"], summary: string, said: string | null) {
  await db().begin(async (tx) => {
    const [ok] = await tx<{ id: string }[]>`
      update practice_os.studio_projects set doc = ${tx.json(doc as never)}, cursor = cursor + 1, updated_at = now()
       where id = ${project.id} and cursor = ${project.cursor} returning id`;
    if (!ok) throw new StaleError();
    await tx`delete from practice_os.studio_steps where project_id = ${project.id} and seq > ${project.cursor}`;
    await tx`
      insert into practice_os.studio_steps (project_id, seq, source, said, ops, summary, doc)
      values (${project.id}, ${project.cursor + 1}, ${source}, ${said}, ${tx.json(ops as never)}, ${summary.slice(0, 300)}, ${tx.json(doc as never)})`;
  });
}

class StaleError extends Error {}
const STALE = "Something else changed this at the same time. Look at it again, then try once more.";

/**
 * Keeps the history small: the last KEEP_STEPS steps, with older ones folded into base_doc
 * (step numbers start again at 1), and only the pictures a step, the base or the current
 * document still points at.
 */
async function compact(id: string) {
  await db().begin(async (tx) => {
    const [p] = await tx<{ cursor: number; last: number }[]>`
      select s.cursor, coalesce((select max(seq) from practice_os.studio_steps where project_id = s.id), 0)::int as last
        from practice_os.studio_projects s where s.id = ${id} for update`;
    if (!p) return;
    const fold = Math.min(p.cursor, p.last - KEEP_STEPS);
    if (fold > 0) {
      await tx`
        update practice_os.studio_projects
           set base_doc = (select doc from practice_os.studio_steps where project_id = ${id} and seq = ${fold}), cursor = cursor - ${fold}
         where id = ${id}`;
      await tx`delete from practice_os.studio_steps where project_id = ${id} and seq <= ${fold}`;
      // Two passes, so no step number is taken twice on the way down.
      await tx`update practice_os.studio_steps set seq = seq + 1000000 where project_id = ${id}`;
      await tx`update practice_os.studio_steps set seq = seq - 1000000 - ${fold} where project_id = ${id}`;
    }
    await tx`
      delete from practice_os.studio_pictures sp
       where sp.project_id = ${id}
         and sp.version not in (
           select coalesce((s.doc->>'picture')::int, -1) from practice_os.studio_projects s where s.id = ${id}
           union select coalesce((s.base_doc->>'picture')::int, -1) from practice_os.studio_projects s where s.id = ${id}
           union select coalesce((st.doc->>'picture')::int, -1) from practice_os.studio_steps st where st.project_id = ${id})`;
  });
}

/** A fresh picture version, past every one this project ever had, so an old picture is never reused. */
async function nextPictureVersion(id: string, doc: StudioDoc): Promise<number> {
  const [row] = await db()<{ v: number }[]>`select coalesce(max(version), -1)::int + 1 as v from practice_os.studio_pictures where project_id = ${id}`;
  return Math.max(row?.v ?? 0, doc.picture);
}

/** Draws the new picture for a saved step. Never overwrites a picture already there (a stale tab). */
async function drawPicture(project: Project, doc: StudioDoc, idea: string, deps: MakeDeps) {
  const [post] = await db()<{ topic: PillarId | "other" }[]>`select topic from practice_os.posts where id = ${project.postId}`;
  const facts = await practiceFacts();
  const pillar = PILLAR_BY_ID.get(post && post.topic !== "other" ? post.topic : "first_session")!;
  const note = `Draw a different scene from before${idea ? `: ${idea.slice(0, 200)}` : ""}.`;
  const g = await designPost(pillar, { headline: doc.title || "Post", practiceName: facts.practiceName, licenseLine: facts.licenseLine }, { neverShow: facts.voice?.neverShow, ...deps.graphic, chat: deps.chat, idea: note });
  if (!g.check.ok) throw new Error("The new picture didn't pass the picture check, so the old one stays.");
  const saved = await db()`
    insert into practice_os.studio_pictures (project_id, version, jpeg) values (${project.id}, ${doc.picture}, ${g.jpeg})
    on conflict (project_id, version) do nothing returning version`;
  if (!saved.length) throw new Error(STALE);
}

/** Takes back a step whose picture didn't finish, if nothing else changed the project since. */
async function dropStep(project: Project, seq: number) {
  await db().begin(async (tx) => {
    const [ok] = await tx`
      update practice_os.studio_projects set doc = ${tx.json(project.doc as never)}, cursor = ${project.cursor}, updated_at = now()
       where id = ${project.id} and cursor = ${seq} returning id`;
    if (ok) await tx`delete from practice_os.studio_steps where project_id = ${project.id} and seq = ${seq}`;
  });
}

/** Applies ops (from the canvas, or Muse's proposal for a chat instruction), checks them, saves one step. */
export async function applyEdit(
  id: string,
  ops: unknown[],
  opts: { source: "chat" | "canvas"; said?: string; reply?: string; by: string; expectCursor?: number; reapprove?: boolean } & MakeDeps,
): Promise<EditResult> {
  const project = await getProject(id);
  if (!project) return { ok: false, status: 404, why: "That isn't here any more." };
  if (opts.expectCursor !== undefined && opts.expectCursor !== project.cursor) return { ok: false, status: 409, why: STALE, project };
  if (project.postStatus === "blocked") return { ok: false, status: 409, why: "The safety check held this one back, so it can't be changed.", project };
  const locked = lockRefusal(project, opts.reapprove);
  if (locked) return locked;
  const applied = applyOps(project.doc, ops, { from: opts.source });
  if (!applied.ok) return { ok: false, status: 422, why: applied.why, project };
  const lim = await limits();
  // What she asked the new picture to show is checked before it reaches the image prompt.
  const picture = applied.effects.filter((e) => e.kind === "picture").at(-1);
  if (picture) {
    const idea = pictureIdeaProblems(picture.idea, lim);
    if (idea.hardStop) {
      await audit({ actor: "safety", action: "studio_edit_refused", subjectType: "studio_project", subjectId: id, details: { rule: "self_harm", by: opts.by } });
      await alertCrisis({ source: "media", category: "self_harm", by: opts.by });
      return { ok: false, status: 422, why: CRISIS_REPLY, project, hardStop: true };
    }
    if (idea.problems.length) return { ok: false, status: 422, why: `I didn't change it: ${idea.problems[0]}`, project };
    applied.doc.picture = await nextPictureVersion(id, applied.doc);
  }
  if (Buffer.byteLength(JSON.stringify(applied.doc)) > MAX_DOC_BYTES) return { ok: false, status: 422, why: TOO_BIG, project };
  let check;
  try {
    check = await checkStep(project.doc, applied.doc, lim, { chat: opts.chat });
  } catch {
    return { ok: false, status: 503, why: "Aeon's safety check didn't answer, so nothing changed. Try again in a minute.", project };
  }
  if (!check.ok) {
    if (check.hardStop) {
      await audit({ actor: "safety", action: "studio_edit_refused", subjectType: "studio_project", subjectId: id, details: { rule: "self_harm", by: opts.by } });
      await alertCrisis({ source: "media", category: "self_harm", by: opts.by });
    }
    return { ok: false, status: 422, why: check.hardStop ? check.why : `I didn't change it: ${check.why}`, project, hardStop: check.hardStop };
  }
  const did = ops.map((o) => describeOp(OpSchema.parse(o))).join(", ");
  const summary = applied.notes.length ? `${did} (${applied.notes.join("; ")})` : did;
  // The step is saved first (only one tab can win), then the picture is drawn for it.
  try {
    await saveStep(project, applied.doc, ops, opts.source, summary, opts.said ?? null);
  } catch (err) {
    if (err instanceof StaleError) return { ok: false, status: 409, why: STALE, project };
    throw err;
  }
  if (picture) {
    try {
      await drawPicture(project, applied.doc, picture.idea, opts);
    } catch (err) {
      await dropStep(project, project.cursor + 1);
      return { ok: false, status: 502, why: err instanceof Error && err.message ? err.message : "Aeon couldn't draw a new picture. Try again.", project: (await getProject(id)) ?? project };
    }
  }
  await syncPost(id, applied.doc, { by: opts.by, reapprove: opts.reapprove });
  await compact(id);
  return { ok: true, project: (await getProject(id))!, reply: opts.reply ?? `${summary}.` };
}

const UNDO = /^\s*(undo( that| it)?|go back|take that back|change it back)\s*[.!]?\s*$/i;
const REDO = /^\s*(redo( that| it)?)\s*[.!]?\s*$/i;

/** One chat instruction on an open project: the crisis check and PHI guard first, then Muse's proposal, then applyEdit. */
export async function chatEdit(id: string, said: string, opts: { by: string; reapprove?: boolean } & MakeDeps): Promise<EditResult> {
  const crisis = checkCrisis(said);
  if (crisis.crisis) {
    await audit({ actor: "safety", action: "crisis_reply", subjectType: "studio_project", subjectId: id, details: { category: crisis.category, by: opts.by } });
    await alertCrisis({ source: "media", category: crisis.category, by: opts.by });
    return { ok: false, status: 422, why: CRISIS_REPLY, hardStop: true };
  }
  const guarded = await guard(said, "message");
  if (!guarded.ok) {
    await audit({ actor: "safety", action: "phi_refused", subjectType: "studio_project", subjectId: id, details: { kind: guarded.kind, by: opts.by } });
    return { ok: false, status: 422, why: REFUSAL[guarded.kind] };
  }
  if (UNDO.test(said)) return moveCursor(id, -1, opts);
  if (REDO.test(said)) return moveCursor(id, 1, opts);
  const project = await getProject(id);
  if (!project) return { ok: false, status: 404, why: "That isn't here any more." };
  // Asked before Muse is called, so Continue runs her words once.
  const locked = lockRefusal(project, opts.reapprove);
  if (locked) return locked;
  let proposal;
  try {
    proposal = await proposeEdit(said, project.doc, { chat: opts.chat });
  } catch {
    return { ok: false, status: 502, why: "Aeon didn't answer just now. Try again in a minute.", project };
  }
  if (!proposal.ops.length) return { ok: true, project, reply: proposal.reply };
  return applyEdit(id, proposal.ops, { ...opts, source: "chat", said, reply: proposal.reply, expectCursor: project.cursor });
}

/** Undo (-1) or Redo (+1): moves the cursor one step. */
export async function moveCursor(id: string, by: -1 | 1, opts: { by?: string; reapprove?: boolean } = {}): Promise<EditResult> {
  const project = await getProject(id);
  if (!project) return { ok: false, status: 404, why: "That isn't here any more." };
  if (by < 0 && project.cursor === 0) return { ok: false, status: 409, why: "There's nothing to undo.", project };
  if (by > 0 && !project.canRedo) return { ok: false, status: 409, why: "There's nothing to redo.", project };
  return setCursor(project, project.cursor + by, by < 0 ? "Undone." : "Redone.", opts);
}

/** Jumps to any step from the version list (0 = how Aeon first made it). */
export async function goToStep(id: string, seq: number, opts: { by?: string; reapprove?: boolean } = {}): Promise<EditResult> {
  const project = await getProject(id);
  if (!project) return { ok: false, status: 404, why: "That isn't here any more." };
  return setCursor(project, seq, seq === 0 ? "Back to how I first made it." : `Back to step ${seq}.`, opts);
}

/** Puts back the document as it was after step `target`, if that step is there. */
async function setCursor(project: Project, target: number, reply: string, opts: { by?: string; reapprove?: boolean }): Promise<EditResult> {
  const id = project.id;
  if (project.postStatus === "blocked") return { ok: false, status: 409, why: "The safety check held this one back, so it can't be changed.", project };
  const locked = lockRefusal(project, opts.reapprove);
  if (locked) return locked;
  const [row] =
    target === 0
      ? await db()<{ doc: unknown }[]>`select base_doc as doc from practice_os.studio_projects where id = ${id}`
      : await db()<{ doc: unknown }[]>`select doc from practice_os.studio_steps where project_id = ${id} and seq = ${target}`;
  const doc = parseDoc(row?.doc);
  if (!doc) return { ok: false, status: 409, why: "That version isn't here.", project };
  const [ok] = await db()<{ id: string }[]>`
    update practice_os.studio_projects set doc = ${db().json(doc as never)}, cursor = ${target}, updated_at = now()
     where id = ${id} and cursor = ${project.cursor} returning id`;
  if (!ok) return { ok: false, status: 409, why: STALE, project };
  await syncPost(id, doc, { by: opts.by ?? "aeon:studio", reapprove: opts.reapprove });
  return { ok: true, project: (await getProject(id))!, reply };
}
