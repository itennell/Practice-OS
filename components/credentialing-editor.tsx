"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { SpringCheck } from "./shared/spring-check";
import { DateField } from "./shared/date-field";
import { SettingSelect, TextField } from "./shared/settings-controls";
import { Button } from "./ui";

// Her credentialing profile, one CAQH section per card, each with Edit and Save.
// Saving goes through the same function Aeon's update_credentialing tool uses.
// There is no license-number field, on purpose.

type Kind = "text" | "number" | "date" | "checkbox" | "select" | "money";
type Field = { key: string; label: string; kind?: Kind; options?: { value: string; label: string }[]; optional?: boolean };
type Obj = Record<string, unknown>;

const STATE_HINT = "2 letters, e.g. IL";

const OBJECT_SECTIONS: { id: string; title: string; fields: Field[]; note?: string }[] = [
  {
    id: "identity",
    title: "Identity",
    fields: [
      { key: "name", label: "Full name" },
      { key: "credential", label: "Credential (e.g. LCPC)" },
      { key: "practice_name", label: "Practice name" },
      { key: "email", label: "Email", optional: true },
      { key: "phone", label: "Phone", optional: true },
    ],
  },
  {
    id: "license",
    title: "License",
    note: "License number: not stored here. You type it into CAQH and payer portals yourself.",
    fields: [
      { key: "type", label: "License type" },
      { key: "state", label: `State (${STATE_HINT})` },
      { key: "board", label: "Licensing board" },
    ],
  },
  {
    id: "npi",
    title: "NPI",
    fields: [
      { key: "npi", label: "NPI (10 digits)" },
      {
        key: "npi_type",
        label: "Type",
        kind: "select",
        options: [
          { value: "1", label: "Type 1 (individual)" },
          { value: "2", label: "Type 2 (organization)" },
        ],
      },
      { key: "taxonomy", label: "Taxonomy code (e.g. 101YP2500X)" },
    ],
  },
  { id: "tin", title: "Tax ID", fields: [{ key: "tin", label: "Practice EIN (12-3456789)" }] },
  {
    id: "malpractice",
    title: "Malpractice",
    fields: [
      { key: "carrier", label: "Carrier" },
      { key: "per_claim", label: "Per claim ($)", kind: "money" },
      { key: "aggregate", label: "Aggregate ($)", kind: "money" },
      { key: "expires_on", label: "Expires", kind: "date" },
    ],
  },
  {
    id: "practice_location",
    title: "Practice location",
    fields: [
      { key: "name", label: "Location name" },
      { key: "street", label: "Street" },
      { key: "city", label: "City" },
      { key: "state", label: `State (${STATE_HINT})` },
      { key: "zip", label: "ZIP" },
      { key: "phone", label: "Phone", optional: true },
      { key: "telehealth", label: "Also sees clients by telehealth", kind: "checkbox" },
    ],
  },
];

const EDUCATION: Field[] = [
  { key: "degree", label: "Degree" },
  { key: "school", label: "School" },
  { key: "graduated", label: "Year", kind: "number" },
];
const JOBS: Field[] = [
  { key: "employer", label: "Employer" },
  { key: "role", label: "Role" },
  { key: "from", label: "From", kind: "date" },
  { key: "to", label: "To (blank if current)", kind: "date", optional: true },
];
const GAPS: Field[] = [
  { key: "from", label: "Gap from", kind: "date" },
  { key: "to", label: "Gap to", kind: "date" },
  { key: "reason", label: "Explanation" },
];
const DOCUMENTS: Field[] = [
  { key: "label", label: "Document" },
  { key: "upload", label: "What to upload" },
  { key: "expires_on", label: "Expires (blank if never)", kind: "date", optional: true },
  { key: "on_file", label: "On file in CAQH", kind: "checkbox" },
];

const money = (n: unknown) => `$${Number(n ?? 0).toLocaleString("en-US")}`;
const show = (f: Field, v: unknown): string => {
  if (f.kind === "checkbox") return v ? "Yes" : "No";
  if (f.kind === "money") return money(v);
  if (f.kind === "select") return f.options?.find((o) => o.value === String(v))?.label ?? String(v ?? "");
  return v === null || v === undefined || v === "" ? "Not set" : String(v);
};

function toInput(f: Field, v: unknown): unknown {
  if (f.kind === "checkbox") return Boolean(v);
  if (v === null || v === undefined) return "";
  return String(v);
}

function fromInput(f: Field, v: unknown): unknown {
  if (f.kind === "checkbox") return Boolean(v);
  if (f.kind === "number" || f.kind === "money" || f.key === "npi_type") return v === "" ? null : Number(v);
  if ((f.kind === "date" || f.optional) && v === "") return f.kind === "date" ? null : "";
  if (f.key === "state") return String(v).trim().toUpperCase();
  return typeof v === "string" ? v.trim() : v;
}

function FieldInput({ f, value, onChange }: { f: Field; value: unknown; onChange: (v: unknown) => void }) {
  if (f.kind === "checkbox") {
    return <SpringCheck label={f.label} checked={Boolean(value)} onChange={(c) => onChange(c)} strike={false} />;
  }
  if (f.kind === "select") {
    return <SettingSelect compact label={f.label} value={String(value)} onValueChange={onChange} options={f.options ?? []} />;
  }
  if (f.kind === "date") {
    return <DateField label={f.label} value={String(value ?? "")} onChange={onChange} clearable={f.optional} />;
  }
  return (
    <TextField
      compact
      label={f.label}
      type={f.kind === "number" || f.kind === "money" ? "number" : "text"}
      min={f.kind === "money" ? 0 : undefined}
      value={String(value ?? "")}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function useSave(section: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  async function save(value: unknown): Promise<boolean> {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/credentialing/${section}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Couldn't save. Try again.");
      setMessage({ ok: true, text: "Saved." });
      router.refresh();
      return true;
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Couldn't save. Try again." });
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, message, save };
}

function Message({ m }: { m: { ok: boolean; text: string } | null }) {
  if (!m) return null;
  return (
    <p role={m.ok ? "status" : "alert"} className="text-small font-medium" style={m.ok ? undefined : { color: "var(--danger-fg)" }}>
      {m.text}
    </p>
  );
}

function Card({ id, title, children, extra }: { id: string; title: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <li aria-labelledby={`cred-${id}`} className="rounded-[20px] border border-[var(--hairline)] bg-[var(--glass-strong)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`cred-${id}`} className="font-semibold">
          {title}
        </h3>
        {extra}
      </div>
      <div className="mt-2 flex flex-col gap-3">{children}</div>
    </li>
  );
}

function ObjectSection({ id, title, fields, note, initial }: (typeof OBJECT_SECTIONS)[number] & { initial: Obj }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Obj>(() => Object.fromEntries(fields.map((f) => [f.key, toInput(f, initial[f.key])])));
  const { busy, message, save } = useSave(id);
  return (
    <Card
      id={id}
      title={title}
      extra={
        !editing && (
          <Button type="button" variant="quiet" onClick={() => setEditing(true)}>
            Edit<span className="sr-only"> {title}</span>
          </Button>
        )
      }
    >
      {editing ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const value = Object.fromEntries(fields.map((f) => [f.key, fromInput(f, draft[f.key])]));
            if (await save(value)) setEditing(false);
          }}
          className="flex flex-col gap-3"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map((f) => (
              <FieldInput key={f.key} f={f} value={draft[f.key]} onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))} />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
            <Button type="button" variant="quiet" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
          {fields.map((f) => (
            <div key={f.key} className="contents">
              <dt className="text-small text-[var(--fg-muted)]">{f.label}</dt>
              <dd>{show(f, initial[f.key])}</dd>
            </div>
          ))}
        </dl>
      )}
      {note && <p className="text-small text-[var(--fg-muted)]">{note}</p>}
      <Message m={message} />
    </Card>
  );
}

function RowsEditor({ title, fields, rows, onChange }: { title: string; fields: Field[]; rows: Obj[]; onChange: (r: Obj[]) => void }) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-small font-semibold">{title}</legend>
      {rows.map((r, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-[16px] border border-[var(--hairline)] p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {fields.map((f) => (
              <FieldInput
                key={f.key}
                f={f}
                value={r[f.key]}
                onChange={(v) => onChange(rows.map((x, j) => (j === i ? { ...x, [f.key]: v } : x)))}
              />
            ))}
          </div>
          <div>
            <Button type="button" variant="quiet" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
              Remove<span className="sr-only"> {title} row {i + 1}</span>
            </Button>
          </div>
        </div>
      ))}
      <div>
        <Button type="button" variant="quiet" onClick={() => onChange([...rows, Object.fromEntries(fields.map((f) => [f.key, f.kind === "checkbox" ? false : ""]))])}>
          Add<span className="sr-only"> to {title}</span>
        </Button>
      </div>
    </fieldset>
  );
}

function ListSection({
  id,
  title,
  lists,
  summary,
  toValue,
}: {
  id: string;
  title: string;
  lists: { key: string; title: string; fields: Field[]; rows: Obj[] }[];
  summary: ReactNode;
  toValue: (lists: Record<string, Obj[]>) => unknown;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, Obj[]>>(() =>
    Object.fromEntries(lists.map((l) => [l.key, l.rows.map((r) => Object.fromEntries(l.fields.map((f) => [f.key, toInput(f, r[f.key])])))])),
  );
  const { busy, message, save } = useSave(id);
  return (
    <Card
      id={id}
      title={title}
      extra={
        !editing && (
          <Button type="button" variant="quiet" onClick={() => setEditing(true)}>
            Edit<span className="sr-only"> {title}</span>
          </Button>
        )
      }
    >
      {editing ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const converted = Object.fromEntries(
              lists.map((l) => [l.key, draft[l.key].map((r) => Object.fromEntries(l.fields.map((f) => [f.key, fromInput(f, r[f.key])])))]),
            );
            if (await save(toValue(converted))) setEditing(false);
          }}
          className="flex flex-col gap-4"
        >
          {lists.map((l) => (
            <RowsEditor key={l.key} title={l.title} fields={l.fields} rows={draft[l.key]} onChange={(rows) => setDraft((d) => ({ ...d, [l.key]: rows }))} />
          ))}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
            <Button type="button" variant="quiet" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        summary
      )}
      <Message m={message} />
    </Card>
  );
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40) || "document";

type Values = {
  identity: Obj;
  education: Obj[];
  license: Obj;
  npi: Obj;
  tin: Obj;
  malpractice: Obj;
  practice_location: Obj;
  work_history: { jobs: Obj[]; gaps: Obj[] };
  documents: Obj[];
};

type NpiCheck = { checkedAt: string; found: boolean; name: string | null; taxonomy: string | null; matches: boolean } | null;

function NpiCheckButton({ initial }: { initial: NpiCheck }) {
  const router = useRouter();
  const [check, setCheck] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/credentialing/npi-check", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't check NPPES.");
      setCheck(body);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't check NPPES.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-1">
      <div>
        <Button type="button" variant="quiet" disabled={busy} onClick={run}>
          {busy ? "Checking…" : "Check against NPPES"}
        </Button>
      </div>
      <p aria-live="polite" className="text-small text-[var(--fg-muted)]">
        {check
          ? check.found
            ? `NPPES: ${check.name ?? "found"}, taxonomy ${check.taxonomy ?? "none"}${check.matches ? " (matches)" : " (doesn't match your profile)"}.`
            : "NPPES has no one with this NPI."
          : "Not checked yet."}
      </p>
      {error && (
        <p role="alert" className="text-small" style={{ color: "var(--danger-fg)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

export function CredentialingEditor({ values, npiCheck }: { values: Values; npiCheck: NpiCheck }) {
  const get = (id: string) => (values as unknown as Record<string, Obj>)[id];
  return (
    <ul className="flex flex-col gap-3">
      {OBJECT_SECTIONS.slice(0, 1).map((s) => (
        <ObjectSection key={s.id} {...s} initial={get(s.id)} />
      ))}
      <ListSection
        id="education"
        title="Education"
        lists={[{ key: "rows", title: "Degrees", fields: EDUCATION, rows: values.education }]}
        toValue={(l) => l.rows}
        summary={
          values.education.length ? (
            values.education.map((e, i) => <p key={i}>{`${e.degree}, ${e.school}, ${e.graduated}`}</p>)
          ) : (
            <p className="text-[var(--fg-muted)]">None yet.</p>
          )
        }
      />
      {OBJECT_SECTIONS.slice(1).map((s) => (
        <ObjectSection key={s.id} {...s} initial={get(s.id)} />
      ))}
      <li className="rounded-[20px] border border-[var(--hairline)] bg-[var(--glass-strong)] p-4">
        <NpiCheckButton initial={npiCheck} />
      </li>
      <ListSection
        id="work_history"
        title="Work history"
        lists={[
          { key: "jobs", title: "Jobs", fields: JOBS, rows: values.work_history.jobs },
          { key: "gaps", title: "Gaps over 6 months, explained", fields: GAPS, rows: values.work_history.gaps },
        ]}
        toValue={(l) => ({ jobs: l.jobs, gaps: l.gaps })}
        summary={
          <>
            {values.work_history.jobs.map((j, i) => (
              <p key={i}>{`${j.role}, ${j.employer}: ${String(j.from).slice(0, 7)} to ${j.to ? String(j.to).slice(0, 7) : "now"}`}</p>
            ))}
            {values.work_history.gaps.map((g, i) => (
              <p key={`g${i}`} className="text-small text-[var(--fg-muted)]">{`Gap ${g.from} to ${g.to}: ${g.reason}`}</p>
            ))}
          </>
        }
      />
      <ListSection
        id="documents"
        title="Documents"
        lists={[{ key: "rows", title: "Documents", fields: DOCUMENTS, rows: values.documents }]}
        toValue={(l) => {
          const seen = new Set<string>();
          return l.rows.map((r) => {
            let id = slug(String(r.label));
            while (seen.has(id)) id = `${id}_2`.slice(-40);
            seen.add(id);
            return { id, ...r };
          });
        }}
        summary={values.documents.map((d) => (
          <p key={String(d.id)}>
            {String(d.label)}: {d.on_file ? "on file" : "missing"}
            {d.expires_on ? `, expires ${d.expires_on}` : ""}
          </p>
        ))}
      />
    </ul>
  );
}
