"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { ListCard } from "@/components/shared/list-card";
import { SpringCheck } from "@/components/shared/spring-check";
import { TextField } from "@/components/shared/settings-controls";
import { notify } from "@/components/shared/toaster";
import { ThoughtLine } from "@/components/shared/thought-line";
import { Button } from "@/components/ui";
import type { SiteCopy } from "@/lib/media/website";
import { CopyButton } from "./copy-button";

// Media > Website. Has one: her address and a short checklist. Doesn't: the
// recommended way to make one as plain steps, and Aeon's words for each page.

type Item = { id: string; label: string };
type Rec = { name: string; cost: string; why: string; source: string };

async function post(body: unknown) {
  const res = await fetch("/api/media/website", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "That didn't work. Try again.");
  return data;
}

function Checklist({ items, done: initial, canWrite }: { items: Item[]; done: string[]; canWrite: boolean }) {
  const [done, setDone] = useState(initial);
  return (
    <ListCard id="check-heading" label={`Check your website (${done.length} of ${items.length})`}>
      {items.map((i) => (
        <li key={i.id} className="flex min-h-[56px] items-center border-t border-[var(--line)] px-4 py-2">
          <SpringCheck
            label={i.label}
            checked={done.includes(i.id)}
            disabled={!canWrite}
            onChange={async (on: boolean) => {
              const next = on ? [...done, i.id] : done.filter((d) => d !== i.id);
              setDone(next);
              try {
                await post({ action: "checklist", done: next });
              } catch (err) {
                setDone(done);
                notify.error(err instanceof Error ? err.message : String(err));
              }
            }}
          />
        </li>
      ))}
    </ListCard>
  );
}

export function WebsiteHelper({
  url: initialUrl,
  status,
  checklist,
  done,
  steps,
  rec,
  metaNote,
  hipaa,
  site: initialSite,
  canWrite,
}: {
  url: string | null;
  status: "has" | "wants" | "no" | null;
  checklist: Item[];
  done: string[];
  steps: string[];
  rec: Rec;
  metaNote: string;
  hipaa: string;
  site: SiteCopy | null;
  canWrite: boolean;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [typed, setTyped] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [mode, setMode] = useState<"has" | "make">(initialUrl || status === "has" ? "has" : "make");
  const [site, setSite] = useState(initialSite);
  const [writing, setWriting] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Do you have a website?">
        <Button type="button" variant={mode === "has" ? "primary" : "quiet"} aria-pressed={mode === "has"} onClick={() => setMode("has")}>
          I have a website
        </Button>
        <Button type="button" variant={mode === "make" ? "primary" : "quiet"} aria-pressed={mode === "make"} onClick={() => setMode("make")}>
          I need one
        </Button>
      </div>

      {mode === "has" && (
        <>
          {url ? (
            <p className="text-body">
              Your website:{" "}
              <a href={url} target="_blank" rel="noreferrer" className="text-[var(--link)] underline underline-offset-2">
                {url.replace(/^https?:\/\//, "")}
              </a>
            </p>
          ) : (
            canWrite && (
              <form
                className="flex flex-wrap items-end gap-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setUrlError(null);
                  try {
                    const r = await post({ action: "url", url: typed });
                    setUrl(r.url);
                    notify.success("Saved your website");
                  } catch (err) {
                    setUrlError(err instanceof Error ? err.message : String(err));
                  }
                }}
              >
                <TextField
                  label="What is your website address?"
                  placeholder="reyescounseling.com"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  error={urlError ?? undefined}
                />
                <Button type="submit">Save</Button>
              </form>
            )
          )}
          <Checklist items={checklist} done={done} canWrite={canWrite} />
          <p className="text-small text-[var(--fg-muted)]">
            Need words for a page? Tap &ldquo;I need one&rdquo; and Aeon writes them; you can paste them into the site you already have.
          </p>
        </>
      )}

      {mode === "make" && (
        <>
          <section
            aria-labelledby="rec-heading"
            className="flex flex-col gap-2 rounded-[var(--radius-card-sm)] border border-[var(--line)] bg-[var(--glass)] p-5"
          >
            <h2 id="rec-heading" className="text-body font-semibold">
              Aeon suggests: {rec.name}
            </h2>
            <p className="text-small text-[var(--fg-muted)]">{rec.cost}</p>
            <p className="text-small">{rec.why}</p>
            <a
              href={rec.source}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-touch w-fit items-center gap-1 text-small text-[var(--link)] underline underline-offset-2"
            >
              Squarespace prices <ExternalLink size={14} aria-hidden />
            </a>
            <p className="text-small text-[var(--fg-muted)]">{metaNote}</p>
          </section>
          <section aria-labelledby="make-heading" className="flex flex-col gap-2">
            <h2 id="make-heading" className="text-small font-medium text-[var(--fg-muted)]">
              How to make it
            </h2>
            <ol className="flex list-decimal flex-col gap-1.5 pl-6 text-body">
              {steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </section>
        </>
      )}

      <p className="text-small text-[var(--fg-muted)]">{hipaa}</p>

      {canWrite && (
        <Button
          type="button"
          variant={site ? "quiet" : "primary"}
          className="w-fit"
          disabled={writing}
          onClick={async () => {
            setWriting(true);
            try {
              setSite((await post({ action: "pages" })).site);
            } catch (err) {
              notify.error(err instanceof Error ? err.message : String(err));
            } finally {
              setWriting(false);
            }
          }}
        >
          {site ? "Write the pages again" : "Write my pages"}
        </Button>
      )}
      {writing && <ThoughtLine working label="Writing your pages…" showTimer />}

      {site && (
        <>
          <ListCard id="pages-heading" label="Your pages. Read each one and make it yours.">
            {site.pages.map((p) => (
              <li key={p.id} className="flex flex-col gap-2 border-t border-[var(--line)] px-4 py-4">
                <h3 className="text-body font-semibold">{p.label}</h3>
                <p className="whitespace-pre-line text-body">{p.text}</p>
                {p.findings.map((f) => (
                  <p key={f.rule} className={`text-small ${f.severity === "block" ? "font-medium text-[var(--danger-fg)]" : "text-[var(--fg-muted)]"}`}>
                    {f.message}
                  </p>
                ))}
                <CopyButton text={p.text} what={`the ${p.label} page`} />
              </li>
            ))}
          </ListCard>
          <section aria-labelledby="ld-heading" className="flex flex-col gap-2">
            <h2 id="ld-heading" className="text-small font-medium text-[var(--fg-muted)]">
              Practice details for Google
            </h2>
            <p className="text-small">
              Paste this into your site&rsquo;s header code box (on Squarespace: Settings, Advanced, Code Injection, Header). It tells Google your practice
              name, address and phone.
            </p>
            <pre tabIndex={0} aria-label="Practice details block" className="max-h-64 overflow-auto rounded-[16px] border border-[var(--line)] bg-[var(--glass)] p-4 text-[0.8125rem]">
              <code>{site.jsonLd}</code>
            </pre>
            <CopyButton text={site.jsonLd} what="the practice details block" />
          </section>
        </>
      )}
    </div>
  );
}
