import { connection } from "next/server";
import { Suspense } from "react";
import { Lightbulb } from "lucide-react";
import { ListCard, ListRow } from "@/components/shared/list-card";
import { InstagramBoard } from "@/components/instagram/instagram-board";
import { Studio } from "@/components/studio/studio";
import { latestIdeas } from "@/lib/instagram/coach";
import { instagramDeclined } from "@/lib/instagram/onboarding";
import { PILLAR_BY_ID } from "@/lib/instagram/pillars";
import { listPosts, practiceFacts } from "@/lib/instagram/store";
import { getProfile } from "@/lib/profile";
import { getProject, listProjects } from "@/lib/studio/store";

export const metadata = { title: "Instagram · Practice-OS" };

// Instagram (AGENTS.md > The four helpers): the content studio. Chat-first: she
// tells Aeon what to make and what to change, and the canvas shows it as it will
// look; each post waits for her approval, then she downloads it and posts it
// herself. Her posts are listed under it.
export default function InstagramPage() {
  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-6">
      <header className="flex items-start gap-4">
        <span aria-hidden className="orb-instagram mt-1 inline-block size-10 shrink-0" />
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="text-title break-words">Instagram</h1>
          <p className="max-w-[60ch] text-[var(--fg-muted)]">
            Posts about how your practice works: first sessions, fees, booking, you, and where you see clients. Aeon
            writes them; you approve each one and post it yourself.
          </p>
        </div>
      </header>
      <Suspense fallback={<div aria-hidden className="h-40 animate-pulse rounded-[24px] bg-[var(--hairline)]" />}>
        <Board />
      </Suspense>
    </div>
  );
}

async function Board() {
  await connection(); // read the database per request, never at build time
  const [posts, ideas, profile, latest, facts] = await Promise.all([
    listPosts({ limit: 30 }),
    // After "Not for me" her old ideas don't show.
    instagramDeclined().then((no) => (no ? [] : latestIdeas())).catch(() => []),
    getProfile().catch(() => null),
    listProjects(1)
      .then(([p]) => (p ? getProject(p.id) : null))
      .catch(() => null),
    practiceFacts().catch(() => null),
  ]);
  const sample = profile?.is_sample ? "[Sample] " : "";
  return (
    <>
      <Studio
        initial={latest}
        profile={{ practiceName: profile?.practice_name ?? "Your practice", licenseLine: facts?.licenseLine ?? "", isSample: Boolean(profile?.is_sample) }}
      />
      {/* Aeon's latest post ideas (post_ideas / weekly_plan in chat); shown only when there are some. */}
      {ideas.length > 0 && (
        <ListCard id="ideas-heading" label="Post ideas">
          {ideas.map((i) => (
            <ListRow
              key={i.id}
              icon={<Lightbulb size={16} strokeWidth={1.75} />}
              title={`${i.number}. ${sample}${i.hook}`}
              detail={`${PILLAR_BY_ID.get(i.topic)?.label ?? ""}${i.day ? ` · ${new Date(`${i.day}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}` : ""} · Ask Aeon to draft it`}
            />
          ))}
        </ListCard>
      )}
      <InstagramBoard
        initialPosts={posts}
        profile={{
          practiceName: profile?.practice_name ?? "Your practice",
          place: profile ? [profile.neighborhood, profile.city].filter(Boolean).join(", ") || null : null,
          isSample: Boolean(profile?.is_sample),
        }}
      />
    </>
  );
}
