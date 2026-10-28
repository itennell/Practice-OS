"use client";

import { Plus } from "lucide-react";
import { CONNECTION_CARDS, type ConnectionStatus } from "@/components/connections/registry";
import { DateField } from "@/components/shared/date-field";
import { SettingRadio, SettingSelect, SettingSwitch, TextField } from "@/components/shared/settings-controls";
import { Button, chipClass, Orb } from "@/components/ui";
import { STATES } from "@/lib/compliance/states";
import { firstFor, HELPERS, type Screen, type Stage } from "@/lib/onboarding/chapters";
import type { SetupItem } from "@/lib/onboarding/store";

// One control per kind of answer, built only from the shared controls
// (docs/ui-elements.md). Each takes the current value and reports a new one.

export type FieldProps = {
  screen: Screen;
  value: unknown;
  onChange: (value: unknown) => void;
  setupItems: SetupItem[];
  stage: Stage | null;
  homeState: string | null;
  /** Each Connect card's live status (from lib/connect/status.ts), by provider. */
  connections: Record<string, ConnectionStatus>;
  error?: string;
};

const STATE_OPTIONS = Object.entries(STATES)
  .sort((a, b) => a[1].localeCompare(b[1]))
  .map(([value, label]) => ({ value, label }));

export const FEE_ROWS = [
  { code: "90791", label: "First visit (intake)" },
  { code: "90837", label: "Session, 53 minutes or more" },
  { code: "90834", label: "Session, 38 to 52 minutes" },
];

/** A value a screen starts with when nothing is saved yet. */
export function emptyValue(s: Screen, stage: Stage | null, homeState: string | null): unknown {
  switch (s.kind) {
    case "contact":
      return { email: "", phone: "" };
    case "yesno_date":
      return { yes: null, date: "" };
    case "ce":
      return { first_renewal: null, hours: "" };
    case "staff":
      return { employees: "0", contractors: null };
    case "medicare":
      return { status: "", date: "" };
    case "address":
      return { street: "", city: "", state: homeState ?? "", zip: "", neighborhood: "" };
    case "malpractice":
      return { carrier: "", expires_on: "", per_claim: "1000000", aggregate: "3000000" };
    case "office_days":
      return { weekdays: [1, 2, 3, 4, 5], close_federal_holidays: true };
    case "fees":
      return FEE_ROWS.map((r) => ({ ...r, cents: 0 }));
    case "payers":
      return [];
    case "setup":
      return {};
    case "who":
      return { chips: [], work: [], text: "" };
    case "team": {
      const first = new Set<string>(["admin", ...firstFor(stage).helpers]);
      return Object.fromEntries(HELPERS.map((h) => [h.id, first.has(h.id)]));
    }
    case "yesno":
      return null;
    case "helper":
      return s.helper?.question.kind === "choices" && s.helper.question.multi ? [] : s.helper?.question.kind === "yesno" ? null : "";
    default:
      return "";
  }
}

/** Whether Next can be pressed: something is answered. Skip and Set up later always work. */
export function isAnswered(s: Screen, v: unknown): boolean {
  const o = (v ?? {}) as Record<string, unknown>;
  switch (s.kind) {
    case "contact":
      return Boolean(String(o.email ?? "").trim() || String(o.phone ?? "").trim());
    case "yesno_date":
      return typeof o.yes === "boolean";
    case "ce":
      return typeof o.first_renewal === "boolean";
    case "staff":
      return typeof o.contractors === "boolean" && String(o.employees ?? "") !== "";
    case "medicare":
      return Boolean(o.status);
    case "address":
      return ["street", "city", "state", "zip"].every((k) => String(o[k] ?? "").trim());
    case "malpractice":
      return Boolean(String(o.carrier ?? "").trim() && o.expires_on);
    case "office_days":
      return Array.isArray(o.weekdays) && o.weekdays.length > 0;
    case "fees":
      return Array.isArray(v) && v.some((f) => Number((f as { cents: number }).cents) > 0);
    case "payers":
      return Array.isArray(v) && v.length > 0;
    case "setup":
      return Object.keys(o).length > 0;
    case "who":
      return (o.chips as string[])?.length > 0 || (o.work as string[])?.length > 0 || Boolean(String(o.text ?? "").trim());
    case "yesno":
      return typeof v === "boolean";
    case "connect":
    case "team":
    case "slot":
      return true;
    case "helper":
      return Array.isArray(v) ? v.length > 0 : typeof v === "boolean" || Boolean(String(v ?? "").trim());
    default:
      return Boolean(String(v ?? "").trim());
  }
}

/** The value as the server wants it (dollars to cents, "" to null). */
export function toAnswer(s: Screen, v: unknown): unknown {
  const o = (v ?? {}) as Record<string, unknown>;
  switch (s.kind) {
    case "yesno_date":
      return { yes: o.yes, date: o.yes && o.date ? o.date : null };
    case "medicare":
      return { status: o.status, date: o.status !== "none" && o.date ? o.date : null };
    case "ce":
      return o.first_renewal ? { first_renewal: true } : { first_renewal: false, hours: Number(o.hours || 0) };
    case "staff":
      return { employees: Number(o.employees || 0), contractors: o.contractors };
    case "address":
      return { street: o.street, city: o.city, state: o.state, zip: o.zip, ...(String(o.neighborhood ?? "").trim() ? { neighborhood: o.neighborhood } : {}) };
    case "malpractice":
      return { carrier: o.carrier, expires_on: o.expires_on, per_claim: Number(o.per_claim || 0), aggregate: Number(o.aggregate || 0) };
    case "number":
      return Number(v || 0);
    case "helper":
      return s.helper?.question.kind === "number" ? Number(v || 0) : v;
    default:
      return v;
  }
}

const YES_NO = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];
const yn = (b: unknown) => (b === true ? "yes" : b === false ? "no" : "");

function ChipToggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={chipClass(on, true, "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]")}>
      {children}
    </button>
  );
}

const toggle = (list: string[], item: string) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

export function Field({ screen: s, value, onChange, setupItems, stage, homeState, connections, error }: FieldProps) {
  const o = (value ?? {}) as Record<string, unknown>;
  const set = (patch: Record<string, unknown>) => onChange({ ...o, ...patch });
  // The question is the page heading; a choice group gets a short label of its own.
  const label = "Choose one";

  switch (s.kind) {
    case "name":
    case "text":
      return (
        <TextField
          label={s.kind === "name" ? "Your name" : "Practice name"}
          hideLabel={false}
          autoComplete={s.kind === "name" ? "name" : "organization"}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          maxLength={160}
          error={error}
          required={s.required}
        />
      );
    case "phone":
      return (
        <TextField label="Phone number" type="tel" inputMode="tel" autoComplete="tel" placeholder="(312) 555-0100" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} error={error} />
      );
    case "npi":
      return <TextField label="NPI" inputMode="numeric" autoComplete="off" placeholder="10 digits" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} maxLength={14} error={error} />;
    case "ein":
      return <TextField label="Tax ID (EIN)" autoComplete="off" placeholder="12-3456789" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} maxLength={12} error={error} />;
    case "number":
      return <TextField label="Number" inputMode="numeric" value={String(value ?? "")} onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))} error={error} />;
    case "contact":
      return (
        <div className="flex flex-col gap-1">
          <TextField label="Practice email" type="email" autoComplete="email" value={String(o.email ?? "")} onChange={(e) => set({ email: e.target.value })} />
          <TextField label="Phone number clients call" type="tel" inputMode="tel" autoComplete="tel" placeholder="(312) 555-0100" value={String(o.phone ?? "")} onChange={(e) => set({ phone: e.target.value })} error={error} />
        </div>
      );
    case "state":
      return <SettingSelect label="State" value={String(value ?? "")} onValueChange={(v) => onChange(v)} options={STATE_OPTIONS} />;
    case "license":
    case "choice":
    case "mode":
      return (
        <SettingRadio
          label={label}
          value={String(value ?? "")}
          onValueChange={(v) => onChange(v)}
          options={(s.options ?? []).map((x) => ({ value: x.value, label: x.label, description: x.hint }))}
        />
      );
    case "yesno":
      return <SettingRadio label={label} value={yn(value)} onValueChange={(v) => onChange(v === "yes")} options={YES_NO} />;
    case "yesno_date":
      return (
        <div className="flex flex-col gap-2">
          <SettingRadio label={label} value={yn(o.yes)} onValueChange={(v) => set({ yes: v === "yes" })} options={YES_NO} />
          {o.yes === true && s.dateAsk && <DateField label={s.dateAsk} value={String(o.date ?? "")} onChange={(d) => set({ date: d })} clearable />}
        </div>
      );
    case "date":
      return <DateField label="Date" value={String(value ?? "")} onChange={(d) => onChange(d)} clearable />;
    case "ce":
      return (
        <div className="flex flex-col gap-2">
          <SettingRadio label={label} value={yn(o.first_renewal)} onValueChange={(v) => set({ first_renewal: v === "yes" })} options={YES_NO} />
          {o.first_renewal === false && (
            <TextField label="Hours of continuing education since you last renewed" inputMode="numeric" value={String(o.hours ?? "")} onChange={(e) => set({ hours: e.target.value.replace(/[^\d.]/g, "") })} error={error} />
          )}
        </div>
      );
    case "staff":
      return (
        <div className="flex flex-col gap-2">
          <TextField label="Number of employees (not counting you)" inputMode="numeric" value={String(o.employees ?? "")} onChange={(e) => set({ employees: e.target.value.replace(/\D/g, "") })} />
          <SettingRadio label="Do you pay any contractors?" value={yn(o.contractors)} onValueChange={(v) => set({ contractors: v === "yes" })} options={YES_NO} />
        </div>
      );
    case "medicare":
      return (
        <div className="flex flex-col gap-2">
          <SettingRadio label={label} value={String(o.status ?? "")} onValueChange={(v) => set({ status: v })} options={(s.options ?? []).map((x) => ({ value: x.value, label: x.label }))} />
          {(o.status === "enrolled" || o.status === "opted_out") && (
            <DateField
              label={o.status === "enrolled" ? "When is your revalidation due?" : "When does your opt-out end?"}
              value={String(o.date ?? "")}
              onChange={(d) => set({ date: d })}
              clearable
            />
          )}
        </div>
      );
    case "address":
      return (
        <div className="grid gap-x-4 sm:grid-cols-2">
          <TextField wrapClassName="sm:col-span-2" label="Street address" autoComplete="street-address" value={String(o.street ?? "")} onChange={(e) => set({ street: e.target.value })} />
          <TextField label="City" autoComplete="address-level2" value={String(o.city ?? "")} onChange={(e) => set({ city: e.target.value })} />
          <SettingSelect label="State" value={String(o.state ?? homeState ?? "")} onValueChange={(v) => set({ state: v })} options={STATE_OPTIONS} />
          <TextField label="ZIP code" inputMode="numeric" autoComplete="postal-code" value={String(o.zip ?? "")} onChange={(e) => set({ zip: e.target.value })} maxLength={10} />
          <TextField label="Neighborhood (optional)" value={String(o.neighborhood ?? "")} onChange={(e) => set({ neighborhood: e.target.value })} error={error} />
        </div>
      );
    case "malpractice":
      return (
        <div className="grid gap-x-4 sm:grid-cols-2">
          <TextField wrapClassName="sm:col-span-2" label="Insurance company" value={String(o.carrier ?? "")} onChange={(e) => set({ carrier: e.target.value })} />
          <DateField label="Policy ends on" value={String(o.expires_on ?? "")} onChange={(d) => set({ expires_on: d })} compact={false} />
          <span className="hidden sm:block" />
          <TextField label="Coverage per claim ($)" inputMode="numeric" value={String(o.per_claim ?? "")} onChange={(e) => set({ per_claim: e.target.value.replace(/\D/g, "") })} />
          <TextField label="Coverage per year ($)" inputMode="numeric" value={String(o.aggregate ?? "")} onChange={(e) => set({ aggregate: e.target.value.replace(/\D/g, "") })} error={error} />
        </div>
      );
    case "office_days": {
      const days = (o.weekdays as number[]) ?? [];
      const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      return (
        <div className="flex flex-col gap-3">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-body font-medium">Open days</legend>
            <div className="flex flex-wrap gap-2">
              {names.map((n, i) => (
                <ChipToggle key={n} on={days.includes(i)} onClick={() => set({ weekdays: days.includes(i) ? days.filter((d) => d !== i) : [...days, i].sort() })}>
                  {n}
                </ChipToggle>
              ))}
            </div>
          </fieldset>
          <SettingSwitch label="Closed on federal holidays" checked={Boolean(o.close_federal_holidays)} onCheckedChange={(c) => set({ close_federal_holidays: c })} />
          {error && <p className="text-small font-medium text-[var(--danger-fg)]">{error}</p>}
        </div>
      );
    }
    case "fees": {
      const rows = (Array.isArray(value) ? value : []) as { code: string; label: string; cents: number }[];
      const update = (i: number, patch: Partial<{ code: string; label: string; cents: number }>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
      return (
        <div className="flex flex-col gap-1">
          {rows.map((r, i) => {
            const fixed = FEE_ROWS.some((f) => f.code === r.code) && i < FEE_ROWS.length;
            return (
              <div key={i} className="grid items-end gap-x-3 sm:grid-cols-[1fr_10rem]">
                {fixed ? (
                  <p className="pb-4 text-body">
                    {r.label} <span className="text-small text-[var(--fg-muted)]">({r.code})</span>
                  </p>
                ) : (
                  <div className="grid grid-cols-[7rem_1fr] gap-x-3">
                    <TextField label="Code" value={r.code} maxLength={5} onChange={(e) => update(i, { code: e.target.value.toUpperCase() })} />
                    <TextField label="What it is" value={r.label} maxLength={80} onChange={(e) => update(i, { label: e.target.value })} />
                  </div>
                )}
                <TextField
                  label={fixed ? `Fee for ${r.label}, in dollars` : "Fee, in dollars"}
                  hideLabel={fixed}
                  inputMode="decimal"
                  placeholder="$"
                  value={r.cents ? String(r.cents / 100) : ""}
                  onChange={(e) => update(i, { cents: Math.round(Number(e.target.value.replace(/[^\d.]/g, "") || 0) * 100) })}
                />
              </div>
            );
          })}
          <div>
            <Button type="button" variant="quiet" onClick={() => onChange([...rows, { code: "", label: "", cents: 0 }])}>
              <Plus aria-hidden size={18} /> Add another fee
            </Button>
          </div>
          {error && <p className="text-small font-medium text-[var(--danger-fg)]">{error}</p>}
        </div>
      );
    }
    case "payers": {
      const picked = (Array.isArray(value) ? value : []) as string[];
      const options = [
        ...(homeState === "IL" ? ["Blue Cross Blue Shield of Illinois"] : ["Blue Cross Blue Shield"]),
        "Aetna",
        "Cigna",
        "UnitedHealthcare (Optum)",
        "Humana",
        "Medicare",
        "Medicaid",
      ];
      const other = picked.filter((p) => !options.includes(p)).join(", ");
      return (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Insurers">
            {options.map((p) => (
              <ChipToggle key={p} on={picked.includes(p)} onClick={() => onChange(toggle(picked, p))}>
                {p}
              </ChipToggle>
            ))}
          </div>
          <TextField
            label="Others (separate with commas)"
            value={other}
            onChange={(e) => onChange([...picked.filter((p) => options.includes(p)), ...e.target.value.split(",").map((x) => x.trim()).filter((x) => x.length > 1)])}
            error={error}
          />
        </div>
      );
    }
    case "setup": {
      if (setupItems.length === 0) return <p className="text-body text-[var(--fg-muted)]">Nothing to check right now. I&apos;ll add reminders here as your answers come in.</p>;
      return (
        <div className="flex flex-col divide-y divide-[var(--hairline)]">
          {setupItems.map((item) => (
            <SettingRadio
              key={item.id}
              label={item.title}
              value={String(o[item.id] ?? "")}
              onValueChange={(v) => set({ [item.id]: v })}
              options={[
                { value: "done", label: "I have this" },
                { value: "not_yet", label: "Not yet" },
                { value: "not_applicable", label: "Doesn't apply to me" },
              ]}
            />
          ))}
        </div>
      );
    }
    case "who": {
      const chips = (o.chips as string[]) ?? [];
      const work = (o.work as string[]) ?? [];
      return (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h2 className="text-body font-medium">Who you help</h2>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Who you help">
              {(s.options ?? []).map((x) => (
                <ChipToggle key={x.value} on={chips.includes(x.value)} onClick={() => set({ chips: toggle(chips, x.value) })}>
                  {x.label}
                </ChipToggle>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <h2 className="text-body font-medium">How you like to work</h2>
            <div className="flex flex-wrap gap-2" role="group" aria-label="How you like to work">
              {(s.workOptions ?? []).map((x) => (
                <ChipToggle key={x.value} on={work.includes(x.value)} onClick={() => set({ work: toggle(work, x.value) })}>
                  {x.label}
                </ChipToggle>
              ))}
            </div>
          </div>
          <TextField label="In your own words (optional)" placeholder="Like: adults going through big life changes" value={String(o.text ?? "")} onChange={(e) => set({ text: e.target.value })} maxLength={400} error={error} />
        </div>
      );
    }
    case "followups":
      return <TextField label="Your answer" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} maxLength={400} error={error} />;
    case "connect": {
      // The Muse key has its own screen in chapter 1.
      const cards = CONNECTION_CARDS.filter((c) => c.id !== "muse").sort((a, b) => a.order - b.order);
      if (cards.length === 0) {
        return <p className="text-body text-[var(--fg-muted)]">Nothing to connect yet. When your tools are ready, you can connect them in Settings.</p>;
      }
      return (
        <ul className="flex flex-col gap-3">
          {cards.map(({ id, Card }) => (
            <li key={id}>
              <Card status={connections[id] ?? { provider: id, connected: false, scopes: [] }} />
            </li>
          ))}
        </ul>
      );
    }
    case "team": {
      const on = o as Record<string, boolean>;
      const first = firstFor(stage);
      return (
        <div className="flex flex-col gap-3">
          <p className="text-body">{first.focus}</p>
          <ul className="flex flex-col divide-y divide-[var(--hairline)]">
            {HELPERS.map((h) => (
              <li key={h.id} className="flex items-start gap-3 py-2">
                <Orb size={28} className="mt-3" />
                <div className="min-w-0 flex-1">
                  <SettingSwitch
                    label={`${h.name}${first.helpers.includes(h.id) ? " (starts first)" : ""}`}
                    description={h.does}
                    checked={h.id === "admin" ? true : Boolean(on[h.id])}
                    disabled={h.id === "admin"}
                    onCheckedChange={(c) => set({ [h.id]: c })}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      );
    }
    case "helper": {
      const q = s.helper!.question;
      if (q.kind === "choices") {
        if (q.multi) {
          const picked = (Array.isArray(value) ? value : []) as string[];
          return (
            <div className="flex flex-wrap gap-2" role="group" aria-label={s.ask}>
              {q.options.map((x) => (
                <ChipToggle key={x.value} on={picked.includes(x.value)} onClick={() => onChange(toggle(picked, x.value))}>
                  {x.label}
                </ChipToggle>
              ))}
            </div>
          );
        }
        return <SettingRadio label={label} value={String(value ?? "")} onValueChange={(v) => onChange(v)} options={q.options} />;
      }
      if (q.kind === "yesno") return <SettingRadio label={label} value={yn(value)} onValueChange={(v) => onChange(v === "yes")} options={YES_NO} />;
      return (
        <TextField
          label={q.kind === "zip" ? "ZIP code" : q.kind === "number" ? `Number${q.unit ? ` (${q.unit})` : ""}` : "Your answer"}
          inputMode={q.kind === "text" ? undefined : "numeric"}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          maxLength={q.kind === "text" ? (q.maxLength ?? 400) : 10}
          error={error}
        />
      );
    }
    default:
      return null;
  }
}
