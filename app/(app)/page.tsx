import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AeonChat, type ChatEntry } from "@/components/aeon-chat";
import { GlassCard } from "@/components/ui";
import { getConversation, listConversations } from "@/lib/aeon/chat";
import { listApprovals } from "@/lib/approvals";
import { loadApprovalSettings } from "@/lib/approval-settings";
import { morningBrief, type BriefItem } from "@/lib/compliance/brief";
import { getProfile } from "@/lib/profile";

// The app opens on a conversation with Aeon (AGENTS.md, UI-026). The old home
// with the full approvals inbox is now /dashboard.
export default function ChatHome({ searchParams }: PageProps<"/">) {
  return (
    <Suspense fallback={<ChatSkeleton />}>
      <Chat searchParams={searchParams} />
    </Suspense>
  );
}

async function Chat({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  await connection(); // read the database per request, never at build time
  const { c } = await searchParams;
  const id = typeof c === "string" && /^[0-9a-f-]{36}$/i.test(c) ? c : null;
  const [profile, conversations, found, settings] = await Promise.all([
    getProfile(),
    listConversations(),
    id ? getConversation(id) : null,
    loadApprovalSettings(),
  ]);
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
      conversations={conversations.map((x) => ({ id: x.id, title: x.title, updated_at: x.updated_at.toISOString() }))}
      firstName={profile?.full_name.split(" ")[0] ?? null}
      start={<StartCards />}
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

/** Under the message box before the first message: today's brief and what's waiting for her. */
async function StartCards() {
  const [brief, approvals] = await Promise.all([morningBrief(), listApprovals()]);
  const soon = [...brief.this_week, ...brief.urgent_soon].slice(0, 4);
  const waiting = approvals.filter((a) => a.status === "pending");
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <GlassCard aria-labelledby="brief-heading" className="flex flex-col gap-3 p-5">
        <h2 id="brief-heading" className="label-caps">
          This week{brief.is_sample ? " [Sample]" : ""}
        </h2>
        {soon.length === 0 ? (
          <p className="text-[var(--fg-muted)]">Nothing is due in the next 7 days.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {soon.map((item) => (
              <li key={`${item.rule_id}-${item.due_on}`} className="flex flex-col">
                <span className="font-medium">{item.title}</span>
                <span className="text-small text-[var(--fg-muted)]">{dueWords(item)}</span>
              </li>
            ))}
          </ul>
        )}
        <Link href="/deadlines" className="mt-auto text-small font-semibold text-[var(--link)] underline-offset-4 hover:underline">
          All deadlines
        </Link>
      </GlassCard>
      <GlassCard aria-labelledby="waiting-heading" className="flex flex-col gap-3 p-5">
        <h2 id="waiting-heading" className="label-caps">
          Waiting for you ({waiting.length})
        </h2>
        {waiting.length === 0 ? (
          <p className="text-[var(--fg-muted)]">Nothing needs your approval right now.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {waiting.slice(0, 3).map((a) => (
              <li key={a.id} className="font-medium">
                {a.title}
              </li>
            ))}
          </ul>
        )}
        <Link href="/approvals" className="mt-auto text-small font-semibold text-[var(--link)] underline-offset-4 hover:underline">
          Open approvals
        </Link>
      </GlassCard>
    </div>
  );
}

function ChatSkeleton() {
  return (
    <div aria-hidden className="mx-auto flex w-full max-w-[760px] flex-col items-center gap-4 pt-6">
      <div className="size-28 animate-pulse rounded-full bg-[var(--hairline)]" />
      <div className="h-9 w-72 max-w-full animate-pulse rounded-full bg-[var(--hairline)]" />
      <div className="h-[52px] w-full animate-pulse rounded-full bg-[var(--hairline)]" />
    </div>
  );
}
