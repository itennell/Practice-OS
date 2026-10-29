import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CalendarDays, Inbox } from "lucide-react";
import { AeonChat, type ChatEntry } from "@/components/aeon-chat";
import { SUGGESTIONS } from "@/lib/aeon/suggestions";
import { ListCard, ListRow } from "@/components/shared/list-card";
import { chipClass } from "@/components/ui";
import { getConversation } from "@/lib/aeon/chat";
import { listApprovals } from "@/lib/approvals";
import { loadApprovalSettings } from "@/lib/approval-settings";
import { morningBrief, type BriefItem } from "@/lib/compliance/brief";
import { getProfile } from "@/lib/profile";
import { StillToSetUp } from "../onboarding/still-to-set-up";

// The app opens on a conversation with Aeon (AGENTS.md, UI-026). The full approvals
// inbox is /approvals; what the practice needs next is at the top of /admin.
export default function ChatHome({ searchParams }: PageProps<"/">) {
  return (
    <Suspense fallback={<ChatSkeleton />}>
      <Chat searchParams={searchParams} />
    </Suspense>
  );
}

async function Chat({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  await connection(); // read the database per request, never at build time
  const { c, ask } = await searchParams;
  const id = typeof c === "string" && /^[0-9a-f-]{36}$/i.test(c) ? c : null;
  const [profile, found, settings, suggestions] = await Promise.all([
    getProfile(),
    id ? getConversation(id) : null,
    loadApprovalSettings(),
    suggestionsFor(),
  ]);
  // The first run opens on Aeon's onboarding interview until she finishes it.
  if (!profile?.onboarding_completed_at) redirect("/onboarding");
  const messages: ChatEntry[] = (found?.messages ?? []).map((m) => ({
    key: String(m.id),
    role: m.role,
    content: m.content,
    steps: m.steps,
    approvalIds: m.approval_ids,
  }));
  return (
    <AeonChat
      key={found?.conversation.id ?? "new"}
      conversationId={found?.conversation.id ?? null}
      initialMessages={messages}
      firstName={profile?.full_name.split(" ")[0] ?? null}
      start={<StartCards />}
      suggestions={suggestions}
      ask={typeof ask === "string" && !found ? ask.slice(0, 500) : undefined}
      mode={found?.conversation.approval_mode ?? settings.mode}
      // The Vercel demo copy is view only: the pill shows the mode but can't change it.
      modeReadOnly={Boolean(process.env.VERCEL)}
    />
  );
}

function dueWords(item: BriefItem): string {
  if (item.days_left === null || item.due_on === null) return "No date yet";
  if (item.days_left < 0) return `Overdue by ${-item.days_left} day${item.days_left === -1 ? "" : "s"}`;
  if (item.days_left === 0) return "Due today";
  return `Due in ${item.days_left} day${item.days_left === 1 ? "" : "s"}`;
}

/** Under the message box before the first message: one quiet Today list (what's waiting
 *  for her OK and the next deadlines), then anything she put off in onboarding. */
async function StartCards() {
  const [brief, approvals] = await Promise.all([morningBrief(), listApprovals()]);
  const soon = [...brief.this_week, ...brief.urgent_soon].slice(0, 3);
  const waiting = approvals.filter((a) => a.status === "pending");
  return (
    <>
      <ListCard
        id="today-heading"
        label={`Today${brief.is_sample ? " [Sample]" : ""}`}
        action={
          <Link href="/admin" className="inline-flex min-h-touch items-center text-small font-semibold text-[var(--link)] underline-offset-4 hover:underline">
            Open Admin
          </Link>
        }
      >
        {waiting.length > 0 ? (
          <ListRow
            accent
            icon={<Inbox size={16} strokeWidth={1.75} />}
            title={`${waiting.length} waiting for your OK`}
            detail={waiting.length > 1 ? `${waiting[0].title}, and ${waiting.length - 1} more` : waiting[0].title}
            end={
              <Link href="/approvals" className={chipClass(true, false, "font-semibold")}>
                Review
              </Link>
            }
          />
        ) : (
          <ListRow icon={<Inbox size={16} strokeWidth={1.75} />} title="Nothing needs your OK" detail="Aeon asks here before it sends, posts or books anything." />
        )}
        {soon.length === 0 ? (
          <ListRow icon={<CalendarDays size={16} strokeWidth={1.75} />} title="Nothing due in the next 7 days" />
        ) : (
          soon.map((item) => (
            <ListRow
              key={`${item.rule_id}-${item.due_on}`}
              icon={<CalendarDays size={16} strokeWidth={1.75} />}
              title={item.title}
              end={<span className="text-small text-[var(--fg-muted)]">{dueWords(item)}</span>}
            />
          ))
        )}
      </ListCard>
      <StillToSetUp />
    </>
  );
}

/** Chips under the message box, from what is actually waiting; the fixed three fill any gap. */
async function suggestionsFor(): Promise<string[]> {
  const approvals = await listApprovals().catch(() => []);
  const waiting = approvals.filter((a) => a.status === "pending").length;
  const picks = ["What needs me this week?", waiting > 0 ? "What's waiting for my OK?" : null, "Draft a Good Faith Estimate"].filter(
    (s): s is string => s !== null,
  );
  for (const s of SUGGESTIONS) if (picks.length < 3 && !picks.includes(s)) picks.push(s);
  return picks.slice(0, 3);
}

function ChatSkeleton() {
  return (
    <div aria-hidden className="mx-auto flex w-full max-w-[640px] flex-col items-center gap-5 pt-[10vh]">
      <div className="size-[72px] animate-pulse rounded-full bg-[var(--hairline)]" />
      <div className="h-11 w-80 max-w-full animate-pulse rounded-full bg-[var(--hairline)]" />
      <div className="h-14 w-full animate-pulse rounded-full bg-[var(--hairline)]" />
    </div>
  );
}
