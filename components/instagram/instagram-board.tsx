"use client";

import { ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ApprovalView } from "@/lib/approvals";
import type { LiveCheck } from "@/lib/instagram/account";
import type { PostView } from "@/lib/instagram/store";
import { ApprovalsInbox } from "../approvals-inbox";
import { TextField } from "../shared/settings-controls";
import { StatusPill, type Status } from "../shared/status-mark";
import { ThoughtLine } from "../shared/thought-line";
import { Button, ButtonLink, GlassCard } from "../ui";

const PILLAR_LABEL: Record<PostView["pillar"], string> = {
  first_session: "Your first session",
  fees_superbills: "Fees and superbills",
  how_to_book: "How to book",
  meet_the_clinician: "Meet the clinician",
  office_telehealth: "Office and telehealth",
  other: "Other",
};

function postStatus(p: PostView): { status: Status; label: string } {
  if (p.status === "published") return { status: "done", label: "Live on Instagram" };
  if (p.status === "blocked") return { status: "declined", label: "Blocked" };
  if (p.status === "failed" || p.approvalStatus === "failed") return { status: "failed", label: "Didn't post" };
  if (p.status === "publishing" || p.approvalStatus === "running") return { status: "running", label: "Posting…" };
  if (p.approvalStatus === "rejected") return { status: "declined", label: "Declined" };
  if (p.approvalStatus === "done") return { status: "done", label: "Checked (test mode)" };
  return { status: "pending", label: "Waiting for you" };
}

function AccountLine({ account }: { account: LiveCheck | { state: "unreachable"; reason: string } }) {
  if (account.state === "connected") return <StatusPill status="done">Connected as @{account.username}</StatusPill>;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="text-small text-[var(--fg-muted)]">
        {account.state === "not_connected"
          ? "Instagram isn't connected yet. You can still plan and approve posts; they go live once it is."
          : account.reason}
      </p>
      <ButtonLink variant="quiet" href="/settings/connections">
        {account.state === "not_connected" ? "Connect Instagram" : "Connect again"}
      </ButtonLink>
    </div>
  );
}

function PostCard({ post, approval }: { post: PostView; approval: ApprovalView | undefined }) {
  const s = postStatus(post);
  const headingId = `post-${post.id}`;
  return (
    <li aria-labelledby={headingId} className="flex flex-col gap-4 rounded-[24px] border border-[var(--hairline)] bg-[var(--glass-strong)] p-5">
      <div className="flex flex-col gap-4 sm:flex-row">
        {post.hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- a private, per-post JPEG from our own route
          <img
            src={`/api/instagram/posts/${post.id}/image`}
            alt={post.altText ?? ""}
            width={216}
            height={270}
            className="aspect-[4/5] w-full max-w-[216px] shrink-0 rounded-[16px] border border-[var(--hairline)] object-cover"
          />
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="label-caps text-[var(--fg-muted)]">{PILLAR_LABEL[post.pillar]}</p>
              <h3 id={headingId} className="text-section font-semibold leading-snug">
                {post.headline ?? "Post"}
              </h3>
            </div>
            <StatusPill status={s.status}>{s.label}</StatusPill>
          </div>
          {post.status === "blocked" && post.blockedReason && (
            <p className="max-w-[60ch] font-medium" style={{ color: "var(--danger-fg)" }}>
              {post.blockedReason}
            </p>
          )}
          {post.failedReason && post.status === "failed" && (
            <p className="max-w-[60ch] font-medium" style={{ color: "var(--danger-fg)" }}>
              {post.failedReason}
            </p>
          )}
          <details className="group">
            <summary className="inline-flex h-touch cursor-pointer items-center font-medium text-[var(--link)] underline-offset-4 hover:underline">
              Read the caption
            </summary>
            <p className="max-w-[60ch] whitespace-pre-line pt-2 text-[var(--fg)]">{post.caption}</p>
          </details>
          {post.permalink && (
            <ButtonLink variant="quiet" href={post.permalink} target="_blank" rel="noreferrer" className="w-fit">
              View on Instagram <ExternalLink aria-hidden size={16} />
              <span className="sr-only">(opens in a new tab)</span>
            </ButtonLink>
          )}
        </div>
      </div>
      {approval && approval.status === "pending" && <ApprovalsInbox initial={[approval]} ids={[approval.id]} />}
    </li>
  );
}

export function InstagramBoard({
  initialPosts,
  initialApprovals,
  account,
}: {
  initialPosts: PostView[];
  initialApprovals: ApprovalView[];
  account: LiveCheck | { state: "unreachable"; reason: string };
}) {
  const router = useRouter();
  const [, startRefresh] = useTransition();
  const [working, setWorking] = useState<null | "plan" | "ask">(null);
  const [ask, setAsk] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "problem"; text: string } | null>(null);
  const approvals = new Map(initialApprovals.map((a) => [a.id, a]));

  async function run(kind: "plan" | "ask") {
    setMessage(null);
    setWorking(kind);
    try {
      const res =
        kind === "plan"
          ? await fetch("/api/instagram/plan", { method: "POST" })
          : await fetch("/api/instagram/posts", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ request: ask }),
            });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ tone: "problem", text: data.error ?? "Something went wrong. Try again." });
      } else if (kind === "plan") {
        setMessage({ tone: "ok", text: `${data.saved.length - data.blocked} posts are ready for you to look at${data.blocked ? `; ${data.blocked} were blocked by the safety check` : ""}.` });
      } else if (data.outcome === "blocked") {
        setMessage({ tone: "problem", text: `Aeon didn't write this one. ${data.why}` });
      } else if (data.outcome === "rewritten") {
        setMessage({ tone: "ok", text: `Aeon wrote a different post instead: "${data.headline}". ${data.why ?? "The first draft didn't pass the safety check."}` });
        setAsk("");
      } else if (data.outcome === "blocked_after_rewrite") {
        setMessage({ tone: "problem", text: `Aeon couldn't write a safe version. ${data.why}` });
      } else {
        setMessage({ tone: "ok", text: `"${data.headline}" is ready for you to look at.` });
        setAsk("");
      }
    } catch {
      setMessage({ tone: "problem", text: "Couldn't reach Practice-OS. Check that the app is running, then try again." });
    } finally {
      setWorking(null);
      startRefresh(() => router.refresh());
    }
  }

  const live = initialPosts.filter((p) => p.status === "published").length;
  const waiting = initialPosts.filter((p) => p.approvalStatus === "pending").length;

  return (
    <>
      <GlassCard className="flex flex-col gap-5 p-6 md:p-8">
        <AccountLine account={account} />
        <div className="flex flex-col gap-3">
          <h2 className="text-section font-semibold">Plan this week</h2>
          <p className="max-w-[60ch] text-[var(--fg-muted)]">
            Aeon writes five posts, one for each topic, checks each one for safety and makes its picture. This takes a few
            minutes. You approve each post on its own.
          </p>
          <Button variant="primary" className="w-fit" disabled={working !== null} onClick={() => run("plan")}>
            Plan this week
          </Button>
        </div>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (ask.trim().length >= 3) run("ask");
          }}
        >
          <TextField
            label="Or ask for one post"
            description="For example: a post about how superbills work."
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            maxLength={600}
            disabled={working !== null}
            compact
          />
          <Button type="submit" variant="quiet" className="w-fit" disabled={working !== null || ask.trim().length < 3}>
            Write this post
          </Button>
        </form>
        {working && (
          <ThoughtLine
            working
            label={working === "plan" ? "Aeon is writing and drawing this week's posts…" : "Aeon is writing your post…"}
          />
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
            {waiting} waiting for you · {live} live
          </p>
        </div>
        {initialPosts.length === 0 ? (
          <p className="text-[var(--fg-muted)]">No posts yet. Press Plan this week, or ask for one post.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {initialPosts.map((p) => (
              <PostCard key={p.id} post={p} approval={p.approvalId ? approvals.get(p.approvalId) : undefined} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
