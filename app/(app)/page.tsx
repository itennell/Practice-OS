import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CalendarDays, Inbox, TriangleAlert, Users } from "lucide-react";
import { NeedPostButton } from "@/components/admin/need-post-button";
import { AeonChat, type ChatEntry } from "@/components/aeon-chat";
import { SUGGESTIONS } from "@/lib/aeon/suggestions";
import { ListCard, ListRow } from "@/components/shared/list-card";
import { chipClass } from "@/components/ui";
import { getConversation } from "@/lib/aeon/chat";
import { loadAlertFailures } from "@/lib/admin/load";
import { crisisSeen } from "@/lib/admin/needs-next";
import { listApprovals } from "@/lib/approvals";
import { loadApprovalSettings } from "@/lib/approval-settings";
import { morningBrief, type BriefItem } from "@/lib/compliance/brief";
import { REFERRALS_ONLY_DEMO } from "@/lib/features";
import { referralFollowUps } from "@/lib/referrals/plan";
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
  const [profile, found, settings, suggestions, alerts] = await Promise.all([
    getProfile(),
    id ? getConversation(id) : null,
    loadApprovalSettings(),
    suggestionsFor(),
    REFERRALS_ONLY_DEMO ? loadAlertFailures().catch(() => []) : [],
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
    <>
      {/* Referrals-only demo: Admin is hidden, so inside a chat a missed crisis alert stays pinned here (the empty Home has it in Today). */}
      {found && alerts[0] && <CrisisBanner id={alerts[0].id} />}
    <AeonChat
      key={found?.conversation.id ?? "new"}
      conversationId={found?.conversation.id ?? null}
      initialMessages={messages}
      firstName={profile?.full_name.split(" ")[0] ?? null}
      start={REFERRALS_ONLY_DEMO ? <ReferralStartCards /> : <StartCards />}
      suggestions={suggestions}
      ask={typeof ask === "string" && !found ? ask.slice(0, 500) : undefined}
      mode={found?.conversation.approval_mode ?? settings.mode}
      // The Vercel demo copy is view only: the pill shows the mode but can't change it.
      modeReadOnly={Boolean(process.env.VERCEL)}
    />
    </>
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

const CRISIS_TITLE = "Aeon showed the 988 message in your chat";
const CRISIS_WHY = "A message mentioned danger or self-harm. Check your chat now.";

/** "I checked", the same as Admin's crisis item (app/api/admin/crisis-seen). */
function CrisisSeenButton({ id }: { id: string }) {
  const action = crisisSeen(`urgent_alert:${id}`);
  return "post" in action ? <NeedPostButton label={action.label} post={action.post} body={action.body} title={CRISIS_TITLE} /> : null;
}

/** Pinned above an open chat in the referrals-only demo while a crisis alert texted no one. */
function CrisisBanner({ id }: { id: string }) {
  return (
    <section
      aria-label="Urgent"
      className="sticky top-14 z-10 mx-auto mb-4 flex w-full max-w-[720px] flex-wrap items-center gap-3 rounded-[20px] border border-[var(--danger-fg)] bg-[var(--color-card)] px-4 py-3 md:top-2 dark:bg-[var(--color-dark-card)]"
    >
      <TriangleAlert aria-hidden size={16} strokeWidth={1.75} className="shrink-0 text-[var(--danger-fg)]" />
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-small font-semibold">{CRISIS_TITLE}</p>
        <p className="text-small text-[var(--fg-muted)]">{CRISIS_WHY}</p>
      </div>
      <CrisisSeenButton id={id} />
    </section>
  );
}

/**
 * The referrals-only demo's Today list (lib/features.ts): what's waiting for her OK and the referral
 * follow-ups due. Admin is hidden, so a crisis alert that texted no one shows here first instead.
 */
async function ReferralStartCards() {
  const [followUps, approvals, alerts] = await Promise.all([referralFollowUps().catch(() => []), listApprovals(), loadAlertFailures().catch(() => [])]);
  const waiting = approvals.filter((a) => a.status === "pending");
  const soon = followUps.slice(0, 3);
  return (
    <>
      <ListCard
        id="today-heading"
        label="Today"
        action={
          <Link href="/referrals" className="inline-flex min-h-touch items-center text-small font-semibold text-[var(--link)] underline-offset-4 hover:underline">
            Open Referrals
          </Link>
        }
      >
        {alerts[0] && (
          <ListRow
            accent
            icon={<TriangleAlert size={16} strokeWidth={1.75} />}
            title={CRISIS_TITLE}
            detail={CRISIS_WHY}
            end={<CrisisSeenButton id={alerts[0].id} />}
          />
        )}
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
          <ListRow icon={<Inbox size={16} strokeWidth={1.75} />} title="Nothing needs your OK" detail="Aeon asks here before any letter goes out." />
        )}
        {soon.length === 0 ? (
          <ListRow icon={<Users size={16} strokeWidth={1.75} />} title="No follow-ups due in the next 7 days" />
        ) : (
          soon.map((f) => (
            <ListRow
              key={f.id}
              icon={<Users size={16} strokeWidth={1.75} />}
              title={`Follow up with ${f.name}`}
              detail={f.last ?? f.stage}
              end={<span className="text-small text-[var(--fg-muted)]">{followUpWords(f.days_left)}</span>}
            />
          ))
        )}
      </ListCard>
      <StillToSetUp />
    </>
  );
}

function followUpWords(days: number): string {
  if (days < 0) return `Overdue by ${-days} day${days === -1 ? "" : "s"}`;
  if (days === 0) return "Due today";
  return `Due in ${days} day${days === 1 ? "" : "s"}`;
}

/** Chips under the message box, from what is actually waiting; the fixed three fill any gap. */
async function suggestionsFor(): Promise<string[]> {
  if (REFERRALS_ONLY_DEMO) return [...SUGGESTIONS]; // the referral tiles (lib/aeon/suggestions.ts)
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
