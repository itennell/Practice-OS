"use client";

import { useState } from "react";
import { INPUT } from "./gfe-timing-check";
import { Button } from "./ui";

// The client's details for one PDF. They go to the server only to build the
// file and are never saved; the form clears itself once the PDF downloads.

const EMPTY = {
  firstName: "",
  middleName: "",
  lastName: "",
  dob: "",
  street: "",
  apartment: "",
  city: "",
  state: "IL",
  zip: "",
  phone: "",
  email: "",
  contactPreference: "email" as "email" | "mail",
  diagnosisCode: "",
};

const FIELDS: { key: keyof typeof EMPTY; label: string; type?: string; required?: boolean; auto?: string }[] = [
  { key: "firstName", label: "First name", required: true, auto: "off" },
  { key: "middleName", label: "Middle name (optional)", auto: "off" },
  { key: "lastName", label: "Last name", required: true, auto: "off" },
  { key: "dob", label: "Date of birth", type: "date", required: true },
  { key: "street", label: "Street", required: true, auto: "off" },
  { key: "apartment", label: "Apartment (optional)", auto: "off" },
  { key: "city", label: "City", required: true, auto: "off" },
  { key: "state", label: "State (2 letters)", required: true, auto: "off" },
  { key: "zip", label: "ZIP", required: true, auto: "off" },
  { key: "phone", label: "Phone", type: "tel", auto: "off" },
  { key: "email", label: "Email", type: "email", auto: "off" },
  { key: "diagnosisCode", label: "Diagnosis code (optional, e.g. F41.1)", auto: "off" },
];

export function GfeMakePdf({ id, reference, issued }: { id: string; reference: string; issued: boolean }) {
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit() {
    setBusy(true);
    setMessage(null);
    try {
      const body = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ""));
      const res = await fetch(`/api/gfe/${id}/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, state: form.state.toUpperCase() }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? "Couldn't make the PDF.");
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `${reference}${issued ? "" : "-DRAFT"}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setForm(EMPTY);
      setMessage({ ok: true, text: "PDF downloaded. The details you typed weren't saved." });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Couldn't make the PDF." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); void submit(); }} autoComplete="off" className="flex flex-col gap-3">
      <p className="text-small text-[var(--fg-muted)]">
        These details go only into the PDF. Aeon doesn’t save them.{" "}
        {issued ? "Keep the PDF with the client’s records for 6 years." : "Not approved yet, so the PDF says DRAFT."}
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {FIELDS.map((f) => (
          <label key={f.key} className="flex flex-col gap-1 text-small font-medium">
            {f.label}
            <input
              type={f.type ?? "text"}
              required={f.required}
              autoComplete={f.auto}
              className={INPUT}
              value={form[f.key]}
              onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
            />
          </label>
        ))}
        <label className="flex flex-col gap-1 text-small font-medium">
          Contact by
          <select
            className={INPUT}
            value={form.contactPreference}
            onChange={(e) => setForm((prev) => ({ ...prev, contactPreference: e.target.value as "email" | "mail" }))}
          >
            <option value="email">Email</option>
            <option value="mail">Mail</option>
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="accent" disabled={busy}>
          {busy ? "Making…" : `Make PDF for ${reference}`}
        </Button>
        {message && (
          <p role={message.ok ? "status" : "alert"} className="text-small font-medium" style={message.ok ? undefined : { color: "var(--danger-fg)" }}>
            {message.text}
          </p>
        )}
      </div>
    </form>
  );
}
