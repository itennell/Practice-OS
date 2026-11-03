"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { notify } from "@/components/shared/toaster";
import { SettingSelect, TextAreaField, TextField } from "@/components/shared/settings-controls";
import { Button, ButtonLink, chipClass } from "@/components/ui";
import type { PreviewRow } from "@/lib/referrals/org-store";
import { cn } from "@/lib/utils";

// "Add someone yourself": an organisation or a person she knows, by hand, or
// many at once from a spreadsheet (CSV). Each card is labelled "Added by you".
// The import shows a preview first: new rows, rows that match a card already
// on her board, and rows with a problem; only the new rows she keeps are added.
// Sensitive kinds (DV/SA agencies, shelters) keep only a city, never a street.

const FOCUS = "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-solid";

export type TypeOption = { value: string; label: string; sensitive: boolean };

type Form = { kind: "organization" | "person"; name: string; organization: string; type: string; phone: string; email: string; street: string; city: string; state: string; zip: string; website: string; notes: string };
const EMPTY: Form = { kind: "organization", name: "", organization: "", type: "", phone: "", email: "", street: "", city: "Chicago", state: "IL", zip: "", website: "", notes: "" };

const STATUS: Record<PreviewRow["status"], string> = {
  new: "New",
  matched: "Matched existing card",
  error: "Problem",
  do_not_contact: "On your do-not-contact list",
};

function ManualForm({ types }: { types: TypeOption[] }) {
  const router = useRouter();
  const [f, setF] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const sensitive = types.find((t) => t.value === f.type)?.sensitive ?? false;
  const options = [{ value: "", label: "Pick a kind" }, ...types];

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const body = sensitive ? { ...f, street: "", zip: "" } : f;
      const res = await fetch("/api/referrals/manual", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json()) as { added?: { name: string }; matched?: { name: string; label: string }; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Couldn't add that.");
      if (data.matched) notify.success(`${data.matched.name} is already on your board (${data.matched.label}), so nothing new was added.`);
      else notify.success(`${data.added?.name ?? f.name} is on your board under Found, added by you.`);
      setF(EMPTY);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      aria-label="Add a referral source yourself"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="flex flex-col gap-3"
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-small text-[var(--fg-muted)]">Who is it</legend>
        <div className="flex flex-wrap gap-2">
          {(["organization", "person"] as const).map((k) => (
            <button key={k} type="button" aria-pressed={f.kind === k} onClick={() => setF((x) => ({ ...x, kind: k }))} className={chipClass(f.kind === k, true, FOCUS)}>
              {k === "organization" ? "An organization" : "A person"}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2 [&>*]:min-w-0">
        <TextField label={f.kind === "person" ? "Their name" : "Organization name"} value={f.name} onChange={set("name")} maxLength={160} required />
        {f.kind === "person" && <TextField label="Where they work" value={f.organization} onChange={set("organization")} maxLength={160} />}
        <SettingSelect label="Kind of referral source" value={f.type} onValueChange={(v) => setF((x) => ({ ...x, type: v }))} options={options} />
        <TextField label="Phone" type="tel" value={f.phone} onChange={set("phone")} maxLength={40} autoComplete="off" />
        <TextField label="Email" type="email" value={f.email} onChange={set("email")} maxLength={200} autoComplete="off" />
        <TextField label="Website" type="url" value={f.website} onChange={set("website")} maxLength={300} placeholder="https://" />
        {!sensitive && <TextField label="Street address" value={f.street} onChange={set("street")} maxLength={160} autoComplete="off" />}
        <TextField label="City" value={f.city} onChange={set("city")} maxLength={80} />
        <TextField label="State" value={f.state} onChange={set("state")} maxLength={2} />
        {!sensitive && <TextField label="ZIP code" inputMode="numeric" value={f.zip} onChange={set("zip")} maxLength={10} />}
      </div>
      {sensitive && (
        <p role="note" className="text-small font-medium">
          Only the city is kept for this kind, never a street address, and it never goes on the map. Contact through their public line only.
        </p>
      )}
      <TextAreaField label="Notes" description="About them and how you know them. Never anything about a client." value={f.notes} onChange={set("notes")} maxLength={500} rows={3} />
      {error && (
        <p role="alert" className="text-small font-medium text-[var(--danger-fg)]">
          {error}
        </p>
      )}
      <div>
        <Button type="submit" variant="accent" disabled={busy || f.name.trim().length < 2 || !f.type} className={FOCUS}>
          {busy ? "Adding…" : "Add to board"}
        </Button>
      </div>
    </form>
  );
}

function CsvImport() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [file, setFile] = useState<string | null>(null);
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [skip, setSkip] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function preview(text: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/referrals/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ csv: text }) });
      const data = (await res.json()) as { rows?: PreviewRow[]; error?: string };
      if (!res.ok || !data.rows) throw new Error(data.error ?? "Couldn't read that file.");
      setRows(data.rows);
      setSkip(new Set());
    } catch (err) {
      setRows(null);
      setError(err instanceof Error ? err.message : "Couldn't read that file.");
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!csv) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/referrals/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ csv, commit: true, skip: [...skip] }) });
      const data = (await res.json()) as { added?: unknown[]; matched?: number; failed?: { line: number; error: string }[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Couldn't import that file.");
      const failed = data.failed?.length ? ` ${data.failed.length} couldn't be added.` : "";
      notify.success(`Added ${data.added?.length ?? 0} to your board under Found.${failed}`);
      setRows(null);
      setCsv(null);
      setFile(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't import that file.");
    } finally {
      setBusy(false);
    }
  }

  const fresh = rows?.filter((r) => r.status === "new" && !skip.has(r.line)).length ?? 0;

  return (
    <div className="flex flex-col gap-3" data-testid="csv-import">
      <p className="text-small text-[var(--fg-muted)]">
        Have a list in a spreadsheet? Save it as CSV with the template&rsquo;s columns. Aeon shows you what it would add first, and skips anyone already on your board.
      </p>
      <div className="flex flex-wrap gap-2">
        <ButtonLink href="/api/referrals/import/template" download="referral-sources-template.csv" variant="quiet" className={FOCUS}>
          Download the template
        </ButtonLink>
        <Button type="button" variant="quiet" onClick={() => input.current?.click()} className={FOCUS}>
          <FileUp size={16} aria-hidden="true" />
          Choose a CSV file
        </Button>
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv"
          aria-label="CSV file to import"
          className="sr-only"
          tabIndex={-1}
          onChange={async (e) => {
            const picked = e.target.files?.[0];
            e.target.value = "";
            if (!picked) return;
            if (picked.size > 200_000) {
              setError("That file is too big. Keep it under 200 KB (about 200 rows).");
              return;
            }
            const text = await picked.text();
            setCsv(text);
            setFile(picked.name);
            await preview(text);
          }}
        />
      </div>
      {file && <p className="text-small text-[var(--fg-muted)]">{file}</p>}
      {error && (
        <p role="alert" className="text-small font-medium text-[var(--danger-fg)]">
          {error}
        </p>
      )}
      {rows && (
        <div role="region" aria-label="Import preview" className="flex flex-col gap-3">
          <p className="font-semibold" aria-live="polite">
            {rows.filter((r) => r.status === "new").length} new, {rows.filter((r) => r.status === "matched").length} matched existing cards, {rows.filter((r) => r.status === "error").length} with a problem
          </p>
          <ul className="overflow-hidden rounded-[var(--radius-card-sm)] border border-[var(--line)] bg-[var(--glass)]">
            {rows.map((r, i) => (
              <li key={r.line} className={cn("flex flex-wrap items-center justify-between gap-2 px-4 py-3", i > 0 && "border-t border-[var(--line)]")}>
                <div className="min-w-0">
                  <p className="font-medium break-words">
                    <span className="text-[var(--fg-muted)]">Row {r.line}: </span>
                    {r.name}
                  </p>
                  <p className="text-small text-[var(--fg-muted)]">
                    {STATUS[r.status]}
                    {r.matched ? `: ${r.matched.name} (${r.matched.label})` : ""}
                    {r.error ? `: ${r.error}` : ""}
                  </p>
                </div>
                {r.status === "new" && (
                  <button
                    type="button"
                    aria-pressed={!skip.has(r.line)}
                    aria-label={`Add row ${r.line}, ${r.name}`}
                    onClick={() => setSkip((s) => {
                      const next = new Set(s);
                      if (next.has(r.line)) next.delete(r.line);
                      else next.add(r.line);
                      return next;
                    })}
                    className={chipClass(!skip.has(r.line), true, FOCUS)}
                  >
                    {skip.has(r.line) ? "Skipped" : "Add"}
                  </button>
                )}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="accent" disabled={busy || fresh === 0} onClick={() => void commit()} className={FOCUS}>
              {busy ? "Adding…" : `Add ${fresh} new`}
            </Button>
            <Button type="button" variant="quiet" disabled={busy} onClick={() => { setRows(null); setCsv(null); setFile(null); }} className={FOCUS}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function AddYourself({ types }: { types: TypeOption[] }) {
  const [tab, setTab] = useState<"one" | "csv">("one");
  return (
    <section aria-labelledby="add-yourself-heading" className="flex flex-col gap-4 rounded-[var(--radius-card-sm)] border border-[var(--line)] bg-[var(--glass)] p-4 md:p-5" data-testid="add-yourself">
      <h2 id="add-yourself-heading" className="text-body font-semibold">
        Add someone yourself
      </h2>
      <p className="text-small text-[var(--fg-muted)]">A nonprofit, a grief center, a nurse navigator you met: anyone the searches can&rsquo;t find. Cards you add are marked &ldquo;Added by you&rdquo;.</p>
      <div role="group" aria-label="How to add" className="flex flex-wrap gap-2">
        <button type="button" aria-pressed={tab === "one"} onClick={() => setTab("one")} className={chipClass(tab === "one", true, FOCUS)}>
          One at a time
        </button>
        <button type="button" aria-pressed={tab === "csv"} onClick={() => setTab("csv")} className={chipClass(tab === "csv", true, FOCUS)}>
          From a spreadsheet
        </button>
      </div>
      {tab === "one" ? <ManualForm types={types} /> : <CsvImport />}
    </section>
  );
}
