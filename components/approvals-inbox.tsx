"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ApprovalView } from "@/lib/approvals";
import { StatusPill } from "./shared/status-mark";
import { Button } from "./ui";

const STATUS = {
  pending: { label: "Waiting for you", mark: "pending" },
  running: { label: "Running…", mark: "running" },
  done: { label: "Done", mark: "done" },
  failed: { label: "Failed", mark: "failed" },
  rejected: { label: "Declined", mark: "declined" },
} as const;

const KIND_LABEL: Record<string, string> = {
  test_note: "Test note",
  referral_letter: "Referral letter",
  instagram_post: "Instagram post",
  sms_reply: "Text reply",
  consult_booking: "Consult booking",
  consult_reschedule: "Consult reschedule",
  consult_cancel: "Consult cancellation",
  web_chat_reply: "Web chat reply",
  state_rules: "State rules",
  gfe_issue: "Good Faith Estimate",
};

function ApprovalStatus({ status }: { status: ApprovalView["status"] }) {
  const s = STATUS[status];
  return <StatusPill status={s.mark}>{s.label}</StatusPill>;
}

const FROM_LABEL: Record<string, string> = {
  aeon: "Aeon",
  "aeon:referrals": "Referrals",
  "aeon:instagram": "Instagram",
  "aeon:front_desk": "Front Desk",
  "aeon:admin": "Admin",
  "aeon:research": "Aeon research",
};

// MCP clients announce themselves by their own internal names; Muse says "tbh".
const MCP_CLIENT_LABEL: Record<string, string> = {
  "claude-code": "Claude Code",
  tbh: "Muse",
  muse: "Muse",
};

function fromLabel(createdBy: string): string {
  if (FROM_LABEL[createdBy]) return FROM_LABEL[createdBy];
  if (createdBy.startsWith("chat:")) return "your chat with Aeon";
  if (createdBy.startsWith("mcp:")) {
    const client = createdBy.slice(4);
    return `${MCP_CLIENT_LABEL[client] ?? client} via MCP`;
  }
  return createdBy;
}

function previewLine(a: ApprovalView): string | null {
  const p = a.preview as Record<string, unknown>;
  for (const key of ["note", "excerpt", "caption_excerpt", "body"]) {
    if (typeof p[key] === "string") return p[key] as string;
  }
  return null;
}

type PreviewRule = { title: string; when: string; source: string; evidence: "cited" | "page" | null };

/** state_rules approvals: what she is about to add, with where each rule came from. */
function RuleList({ preview }: { preview: unknown }) {
  const rules = (preview as { rules?: PreviewRule[] }).rules;
  if (!Array.isArray(rules) || rules.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2 text-small">
      {rules.map((r) => (
        <li key={`${r.title}-${r.source}`} className="flex flex-col">
          <span className="font-semibold">{r.title}</span>
          <span className="text-[var(--fg-muted)]">
            {r.when} · {r.evidence === "page" ? "quote found on the page" : "quoted from a cited page"} ·{" "}
            <a href={r.source} target="_blank" rel="noreferrer" className="text-[var(--link)] underline underline-offset-2">
              {new URL(r.source).hostname}
            </a>
          </span>
        </li>
      ))}
    </ul>
  );
}

function timeAgo(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

function ApprovalItem({
  approval,
  busy,
  now,
  onApprove,
  onDecline,
}: {
  approval: ApprovalView;
  busy: boolean;
  now: number;
  onApprove: (edit?: string) => void;
  onDecline: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(approval.editable?.value ?? "");
  const headingId = `approval-${approval.id}`;
  const pending = approval.status === "pending" && !busy;
  const line = previewLine(approval);

  return (
    <li
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-[20px] border border-[var(--hairline)] bg-[var(--glass-strong)] p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <h3 id={headingId} className="font-semibold leading-snug">
            {approval.title}
          </h3>
          <p className="text-small text-[var(--fg-muted)]">
            {KIND_LABEL[approval.kind] ?? approval.kind} · from {fromLabel(approval.created_by)} ·{" "}
            {timeAgo(approval.created_at, now)}
          </p>
        </div>
        <ApprovalStatus status={busy && approval.status === "pending" ? "running" : approval.status} />
      </div>

      {line && !editing && <p className="max-w-[65ch] text-[var(--fg)]">{line}</p>}

      {!editing && <RuleList preview={approval.preview} />}

      {approval.status === "failed" && approval.error && (
        <p className="text-small font-medium" style={{ color: "var(--danger-fg)" }}>
          {approval.error}
        </p>
      )}

      {editing && approval.editable && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            onApprove(draft);
            setEditing(false);
          }}
        >
          <label className="flex flex-col gap-2">
            <span className="label-caps">Edit before approving</span>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              maxLength={5000}
              className="rounded-[20px] border border-border bg-[var(--chip-off-bg)] px-5 py-3 text-body outline-none focus:border-accent"
            />
          </label>
          <p className="text-small text-[var(--fg-muted)]">The original stays in the audit log.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="accent" disabled={draft.trim() === ""}>
              Approve edited version
            </Button>
            <Button
              type="button"
              variant="quiet"
              onClick={() => {
                setEditing(false);
                setDraft(approval.editable?.value ?? "");
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {pending && !editing && (
        <div className="flex flex-wrap gap-2">
          <Button variant="accent" onClick={() => onApprove()}>
            Approve
          </Button>
          {approval.editable && (
            <Button variant="quiet" onClick={() => setEditing(true)}>
              Edit then approve
            </Button>
          )}
          <Button variant="quiet" onClick={onDecline}>
            Decline
          </Button>
        </div>
      )}
    </li>
  );
}

export function ApprovalsInbox({
  initial,
  showAll = false,
  ids,
}: {
  initial: ApprovalView[];
  showAll?: boolean;
  /** Only these approvals, without the summary line: the cards under one of Aeon's chat replies (UI-027). */
  ids?: string[];
}) {
  const [approvals, setApprovals] = useState(initial);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [announcement, setAnnouncement] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const known = useRef(new Map(initial.map((a) => [a.id, a.status])));

  const announceChanges = useCallback((next: ApprovalView[]) => {
    const changes: string[] = [];
    for (const a of next) {
      const before = known.current.get(a.id);
      if (before && before !== a.status) {
        changes.push(`${a.title}: ${STATUS[a.status].label}${a.status === "failed" && a.error ? `. ${a.error}` : ""}`);
      }
      known.current.set(a.id, a.status);
    }
    if (changes.length) setAnnouncement(changes.join(". "));
  }, []);

  const refresh = useCallback(async () => {
    const query = ids ? `?ids=${ids.join(",")}` : showAll ? "?all=1" : "";
    const res = await fetch(`/api/approvals${query}`, { cache: "no-store" });
    if (!res.ok) return;
    const { approvals: next } = (await res.json()) as { approvals: ApprovalView[] };
    announceChanges(next);
    setApprovals(next);
    setNow(Date.now());
  }, [announceChanges, showAll, ids]);

  // Live status: every second while something is running, every 10 s otherwise.
  const anyRunning = busy.size > 0 || approvals.some((a) => a.status === "running");
  // Chat cards (ids) start empty, so they load straight away too.
  useEffect(() => {
    const first = ids ? setTimeout(refresh, 0) : undefined;
    const timer = setInterval(refresh, anyRunning ? 1000 : 10000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [refresh, anyRunning, ids]);

  async function decide(id: string, action: "approve" | "decline", edit?: string) {
    setProblem(null);
    setBusy((s) => new Set(s).add(id));
    if (action === "approve") {
      const title = approvals.find((a) => a.id === id)?.title ?? "Approval";
      setAnnouncement(`${title}: Running…`);
    }
    try {
      const res = await fetch(`/api/approvals/${id}/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(edit === undefined ? {} : { edit }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok && data.error) setProblem(data.error);
    } catch {
      setProblem("Couldn't reach Practice-OS. Check that the app is running, then try again.");
    } finally {
      setBusy((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
      await refresh();
    }
  }

  const pendingCount = approvals.filter((a) => a.status === "pending").length;

  return (
    <div className="flex flex-col gap-4">
      {!ids && (
        <p className="text-[var(--fg-muted)]">
          {pendingCount === 0
            ? "Nothing is waiting for you. New drafts from Aeon show up here."
            : `${pendingCount} waiting for you. Nothing is sent, posted or booked until you approve it.`}
        </p>
      )}
      {problem && (
        <p role="alert" className="text-small font-medium" style={{ color: "var(--danger-fg)" }}>
          {problem}
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {approvals.map((a) => (
          <ApprovalItem
            key={a.id}
            approval={a}
            busy={busy.has(a.id)}
            now={now}
            onApprove={(edit) => decide(a.id, "approve", edit)}
            onDecline={() => decide(a.id, "decline")}
          />
        ))}
      </ul>
      <p aria-live="polite" role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
