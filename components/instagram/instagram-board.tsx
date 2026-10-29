"use client";

import { Copy, Download, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Research, ResearchAngle } from "@/lib/instagram/research";
import type { PostView } from "@/lib/instagram/store";
import { Slider } from "../shared/slider";
import { TextField } from "../shared/settings-controls";
import { StatusPill, type Status } from "../shared/status-mark";
import { ThoughtLine } from "../shared/thought-line";
import { Button, ButtonLink, GlassCard } from "../ui";
import { PostPreview, type PreviewProfile } from "./post-preview";
import { ReelEditor } from "./reel-editor";

const PILLAR_LABEL: Record<PostView["pillar"], string> = {
  first_session: "Your first session",
  fees_superbills: "Fees and superbills",
  how_to_book: "How to book",
  meet_the_clinician: "Meet the clinician",
  office_telehealth: "Office and telehealth",
  other: "Other",
};

function postStatus(p: PostView): { status: Status; label: string } {
  if (p.status === "ready" || (p.approvalStatus === "done" && p.status !== "published")) return { status: "done", label: "Ready to post" };
  if (p.status === "published") return { status: "done", label: "Posted" };
  if (p.status === "blocked") return { status: "declined", label: "Blocked" };
  if (p.status === "failed" || p.approvalStatus === "failed") return { status: "failed", label: "Didn't work" };
  if (p.approvalStatus === "running") return { status: "running", label: "Working…" };
  if (p.approvalStatus === "rejected") return { status: "declined", label: "Declined" };
  return { status: "pending", label: "Waiting for you" };
}

/** How to post it herself: Aeon writes, she posts (publishing is cut for now). */
const POST_STEPS = [
  "Save the picture, and keep it on your phone.",
  "Tap Copy caption.",
  "Open the Instagram app and tap +.",
  "Pick the picture, then paste the caption.",
  "Tap Share.",
];

function ReadyToPost({ post }: { post: PostView }) {
  const [copied, setCopied] = useState<"" | "yes" | "no">("");
  const image = `/api/instagram/posts/${post.id}/image?download=1`;
  return (
    <div className="flex flex-col gap-3 border-t border-[var(--hairline)] p-4">
      <p className="font-medium">Ready for you to post yourself</p>
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="primary"
          className="w-full"
          onClick={() =>
            navigator.clipboard
              .writeText(post.caption)
              .then(() => setCopied("yes"))
              .catch(() => setCopied("no"))
          }
        >
          <Copy aria-hidden size={18} /> Copy caption
        </Button>
        {post.hasImage && (
          <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
            <ButtonLink variant="quiet" className="w-full" href={image} download>
              <Download aria-hidden size={18} /> Picture 4:5
              <span className="sr-only"> (for the feed, JPEG)</span>
            </ButtonLink>
            <ButtonLink variant="quiet" className="w-full" href={`${image}&shape=square`} download>
              <Download aria-hidden size={18} /> Square picture
              <span className="sr-only"> (JPEG)</span>
            </ButtonLink>
          </div>
        )}
      </div>
      {post.hasImage && <ReelEditor postId={post.id} />}
      <p role="status" aria-live="polite" className={copied ? "text-small" : "sr-only"}>
        {copied === "yes" ? "Caption copied." : copied === "no" ? "Couldn't copy. Tap more on the caption, then select it and copy it." : ""}
      </p>
      <ol className="flex list-decimal flex-col gap-1 pl-6 text-small text-[var(--fg)]">
        {POST_STEPS.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </div>
  );
}

function Decide({ post, onDone }: { post: PostView; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  async function decide(action: "approve" | "decline") {
    setBusy(true);
    setProblem(null);
    try {
      const res = await fetch(`/api/approvals/${post.approvalId}/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setProblem(data.error ?? "That didn't work. Try again.");
    } catch {
      setProblem("Couldn't reach Practice-OS. Check that the app is running, then try again.");
    } finally {
      setBusy(false);
      onDone();
    }
  }
  return (
    <div className="flex flex-col gap-2 border-t border-[var(--hairline)] p-4">
      <p className="text-small text-[var(--fg-muted)]">Nothing is posted. Approve it, and it&apos;s ready for you to post yourself.</p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="accent" disabled={busy} onClick={() => decide("approve")}>
          Approve
        </Button>
        <Button variant="quiet" disabled={busy} onClick={() => decide("decline")}>
          Decline
        </Button>
      </div>
      {problem && (
        <p role="alert" className="text-small font-medium" style={{ color: "var(--danger-fg)" }}>
          {problem}
        </p>
      )}
    </div>
  );
}

function PostCard({ post, profile, onChange }: { post: PostView; profile: PreviewProfile; onChange: () => void }) {
  const s = postStatus(post);
  const headingId = `post-${post.id}`;
  return (
    <li aria-labelledby={`${headingId}-t`} className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <h3 id={`${headingId}-t`} className="min-w-0 font-semibold leading-snug">
          <span className="sr-only">{PILLAR_LABEL[post.pillar]}: </span>
          {post.headline ?? "Post"}
        </h3>
        <StatusPill status={s.status}>{s.label}</StatusPill>
      </div>
      {post.status === "blocked" ? (
        <div className="flex flex-col gap-2 rounded-[20px] border border-[var(--hairline)] bg-[var(--glass-strong)] p-4">
          <p className="label-caps text-[var(--fg-muted)]">{PILLAR_LABEL[post.pillar]}</p>
          <p className="max-w-[60ch] font-medium" style={{ color: "var(--danger-fg)" }}>
            {post.blockedReason ?? "The safety check held this one back."}
          </p>
        </div>
      ) : (
        <PostPreview
          profile={profile}
          imageSrc={post.hasImage ? `/api/instagram/posts/${post.id}/image` : null}
          altText={post.altText}
          caption={post.caption}
          headingId={headingId}
        >
          {post.failedReason && post.status === "failed" && (
            <p className="border-t border-[var(--hairline)] p-4 font-medium" style={{ color: "var(--danger-fg)" }}>
              {post.failedReason}
            </p>
          )}
          {post.approvalId && post.approvalStatus === "pending" && <Decide post={post} onDone={onChange} />}
          {post.status === "ready" && <ReadyToPost post={post} />}
        </PostPreview>
      )}
    </li>
  );
}

const host = (url: string) => new URL(url).hostname.replace(/^www\./, "");

/** Her pick from the research, as words for the writer. */
export function angleRequest(topic: string, a: ResearchAngle): string {
  return `${topic.trim()}. Angle: ${a.title}. Open with this hook or one like it: "${a.hook}". Format idea: ${a.format}.`;
}

function ResearchPanel({
  research,
  kind,
  count,
  disabled,
  onPick,
  onAsTyped,
}: {
  research: Research;
  kind: "write" | "plan";
  count: number;
  disabled: boolean;
  onPick: (a: ResearchAngle) => void;
  onAsTyped: () => void;
}) {
  return (
    <section aria-labelledby="research-heading" className="flex flex-col gap-4 rounded-[16px] border border-[var(--hairline)] p-4">
      <div className="flex flex-col gap-1">
        <h2 id="research-heading" className="font-semibold">
          What other therapists post about this
        </h2>
        <p className="max-w-[65ch] text-[var(--fg)]">{research.summary}</p>
        {research.source === "fixed" && <p className="text-small text-[var(--fg-muted)]">These angles aren&apos;t from the web this time.</p>}
      </div>
      <p className="text-small text-[var(--fg-muted)]">Pick an angle:</p>
      <ul className="flex flex-col gap-3">
        {research.angles.map((a) => (
          <li key={a.title} className="flex flex-col gap-2 rounded-[16px] bg-[var(--chip-off-bg)] p-4 shadow-[inset_0_0_0_1px_var(--hairline)]">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-semibold leading-snug">{a.title}</h3>
              <span className="text-small text-[var(--fg-muted)]">{a.format}</span>
            </div>
            <p className="text-[var(--fg)]">&ldquo;{a.hook}&rdquo;</p>
            <p className="text-small text-[var(--fg-muted)]">{a.why}</p>
            {a.sources.length > 0 && (
              <ul aria-label="Sources" className="flex flex-wrap gap-x-4 gap-y-1">
                {a.sources.map((u) => (
                  <li key={u}>
                    <a
                      href={u}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex min-h-touch items-center gap-1 text-small text-[var(--link)] underline underline-offset-4"
                    >
                      {host(u)} <ExternalLink aria-hidden size={14} />
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <Button
              variant="accent"
              className="w-full sm:w-fit"
              disabled={disabled}
              onClick={() => onPick(a)}
              aria-label={`${kind === "plan" ? `Plan ${count} from this` : "Write this one"}: ${a.title}`}
            >
              {kind === "plan" ? `Plan ${count} from this` : "Write this one"}
            </Button>
          </li>
        ))}
      </ul>
      <Button variant="quiet" className="w-full sm:w-fit" disabled={disabled} onClick={onAsTyped}>
        {kind === "plan" ? "Plan them as I typed it" : "Write it as I typed it"}
      </Button>
    </section>
  );
}

type Offer = { why: string; angle: { label: string; pillar: string } };
type Message = { tone: "ok" | "problem"; text: string };

/** What the routes answer, in her words. */
function say(kind: "write" | "plan", data: Record<string, unknown>): { message: Message | null; offer: Offer | null; clear: boolean } {
  const o = data.outcome;
  if (o === "off_topic") return { message: null, offer: { why: String(data.why), angle: data.angle as Offer["angle"] }, clear: false };
  if (o === "blocked") return { message: { tone: "problem", text: `Aeon didn't write this one. ${data.why}` }, offer: null, clear: false };
  if (kind === "plan") {
    const saved = (data.saved as unknown[]).length;
    const blocked = Number(data.blocked ?? 0);
    return { message: { tone: "ok", text: `${saved - blocked} posts are ready for you to look at${blocked ? `; ${blocked} were held back by the safety check` : ""}.` }, offer: null, clear: true };
  }
  if (o === "rewritten") return { message: { tone: "ok", text: `Aeon wrote a different post instead: "${data.headline}". ${data.why ?? "The first draft didn't pass the safety check."}` }, offer: null, clear: true };
  if (o === "blocked_after_rewrite") return { message: { tone: "problem", text: `Aeon couldn't write a safe version. ${data.why}` }, offer: null, clear: false };
  return { message: { tone: "ok", text: `"${data.headline}" is ready for you to look at.` }, offer: null, clear: true };
}

export function InstagramBoard({ initialPosts, profile }: { initialPosts: PostView[]; profile: PreviewProfile }) {
  const router = useRouter();
  const [, startRefresh] = useTransition();
  const [working, setWorking] = useState<null | "write" | "plan" | "research">(null);
  const [research, setResearch] = useState<{ data: Research; kind: "write" | "plan" } | null>(null);
  const [ask, setAsk] = useState("");
  const [count, setCount] = useState(3);
  const [message, setMessage] = useState<Message | null>(null);
  const [offer, setOffer] = useState<Offer | null>(null);
  const refresh = () => startRefresh(() => router.refresh());

  /** Research first: what therapists post about her topic, then she picks an angle. */
  async function look(kind: "write" | "plan") {
    setMessage(null);
    setOffer(null);
    setResearch(null);
    setWorking("research");
    try {
      const res = await fetch("/api/instagram/research", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topic: ask }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setMessage({ tone: "problem", text: data.error ?? "Something went wrong. Try again." });
      else if (data.outcome === "researched") setResearch({ data: data.research, kind });
      else {
        const r = say(kind, data); // off_topic offers an angle; blocked says why
        setOffer(r.offer);
        setMessage(r.message);
      }
    } catch {
      setMessage({ tone: "problem", text: "Couldn't reach Practice-OS. Check that the app is running, then try again." });
    } finally {
      setWorking(null);
    }
  }

  async function run(kind: "write" | "plan", request = ask, pillar: string | null = null, researchId?: string) {
    setMessage(null);
    setOffer(null);
    setResearch(null);
    setWorking(kind);
    try {
      const res = await fetch(kind === "plan" ? "/api/instagram/plan" : "/api/instagram/posts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ request, ...(kind === "plan" ? { count } : { pillar }), ...(researchId ? { research_id: researchId } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ tone: "problem", text: data.error ?? "Something went wrong. Try again." });
      } else {
        const r = say(kind, data);
        setMessage(r.message);
        setOffer(r.offer);
        if (r.clear) setAsk("");
      }
    } catch {
      setMessage({ tone: "problem", text: "Couldn't reach Practice-OS. Check that the app is running, then try again." });
    } finally {
      setWorking(null);
      refresh();
    }
  }

  const ready = initialPosts.filter((p) => p.status === "ready").length;
  const waiting = initialPosts.filter((p) => p.approvalStatus === "pending").length;
  const canAsk = working === null && ask.trim().length >= 3;

  return (
    <>
      <GlassCard className="flex flex-col gap-5 p-6 md:p-8">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (canAsk) look("write");
          }}
        >
          <TextField
            label="What should the post be about?"
            description="For example: how superbills work, or what to bring to a first session."
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            maxLength={600}
            disabled={working !== null}
          />
          <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
            <Button type="submit" variant="primary" className="w-full sm:w-auto" disabled={!canAsk}>
              Write this post
            </Button>
            <div className="flex w-full flex-wrap items-end gap-3 sm:w-auto">
              <Slider
                label="Posts"
                value={count}
                onValueChange={setCount}
                min={2}
                max={3}
                valueText={(n) => `${n} posts`}
                disabled={working !== null}
                compact
                className="flex-1 sm:w-40 sm:flex-none"
              />
              <Button type="button" variant="quiet" disabled={!canAsk} onClick={() => look("plan")}>
                Plan several
              </Button>
            </div>
          </div>
        </form>
        {working && (
          <ThoughtLine
            working
            label={
              working === "research"
                ? "Aeon is looking at what other therapists post about this…"
                : working === "plan"
                  ? `Aeon is writing and drawing ${count} posts…`
                  : "Aeon is writing your post…"
            }
          />
        )}
        {research && (
          <ResearchPanel
            research={research.data}
            kind={research.kind}
            count={count}
            disabled={working !== null}
            onPick={(a) => run(research.kind, angleRequest(research.data.topic, a), research.kind === "write" ? a.pillar : null, research.data.id ?? undefined)}
            onAsTyped={() => run(research.kind)}
          />
        )}
        {offer && (
          <div className="flex flex-col gap-3 rounded-[16px] border border-[var(--hairline)] p-4">
            <p className="font-medium">{offer.why}</p>
            <p className="text-[var(--fg-muted)]">Here&apos;s the closest post about how your practice works:</p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="accent"
                onClick={() => {
                  setAsk(offer.angle.label);
                  run("write", offer.angle.label, offer.angle.pillar);
                }}
              >
                Write &ldquo;{offer.angle.label}&rdquo;
              </Button>
              <Button variant="quiet" onClick={() => setOffer(null)}>
                Write something else
              </Button>
            </div>
          </div>
        )}
        <p role="status" aria-live="polite" className={message ? "font-medium" : "sr-only"} style={message?.tone === "problem" ? { color: "var(--danger-fg)" } : undefined}>
          {message?.text ?? ""}
        </p>
      </GlassCard>

      <section aria-labelledby="posts-heading" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="posts-heading" className="text-section font-semibold">
            Your posts
          </h2>
          <p className="text-small text-[var(--fg-muted)]">
            {waiting} waiting for you · {ready} ready to post
          </p>
        </div>
        {initialPosts.length === 0 ? (
          <p className="text-[var(--fg-muted)]">No posts yet. Type what a post should be about, then press Write this post.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {initialPosts.map((p) => (
              <PostCard key={p.id} post={p} profile={profile} onChange={refresh} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
