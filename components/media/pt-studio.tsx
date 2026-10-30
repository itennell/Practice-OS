"use client";

import { useState } from "react";
import { ThoughtLine } from "@/components/shared/thought-line";
import type { InterviewState, ProfileView } from "@/lib/media/pt-profile";
import type { DirectoryVersion, ProfileDraft } from "@/lib/media/profile";
import { CopyButton } from "./copy-button";
import { OtherDirectories, PasteSteps, ProfileBuilder } from "./profile-builder";
import { ptCall, PtInterview } from "./pt-interview";
import { PtPreview } from "./pt-preview";

// Media > Directories: Aeon's interview on the left, the whole profile as it will
// read on the right (below it on a phone), then the words box by box, the paste
// steps and the other places to list her practice.

type Who = { name: string; credential: string; place: string; sample: boolean };

export function PtStudio({
  who,
  state,
  view: initialView,
  draft: initialDraft,
  directories: initialDirectories,
  canWrite,
}: {
  who: Who;
  state: InterviewState;
  view: ProfileView;
  draft: ProfileDraft | null;
  directories: DirectoryVersion[];
  canWrite: boolean;
}) {
  const [view, setView] = useState(initialView);
  const [draft, setDraft] = useState(initialDraft);
  const [dirs, setDirs] = useState(initialDirectories);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => setView((await ptCall({})).view);

  async function write() {
    setWriting(true);
    setError(null);
    try {
      const res = await fetch("/api/media/profile", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Aeon couldn't write the profile. Try again.");
      setDraft(data.draft);
      setDirs(data.directories);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setWriting(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="flex flex-col gap-4 lg:sticky lg:top-6">
          <PtInterview initial={state} canWrite={canWrite} onChange={(r) => setView(r.view)} onWrite={write} writing={writing} />
          {writing && <ThoughtLine working label="Writing your profile…" showTimer />}
          {error && (
            <p role="alert" className="text-small font-medium text-[var(--danger-fg)]">
              {error}
            </p>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-small text-[var(--fg-muted)]">
              {view.source === "draft" ? "Aeon's words, from your answers." : "A first draft from your answers so far. Tap Write my profile at the end for Aeon's words."}
            </p>
            <CopyButton text={view.exportText} what="your whole profile" label="Copy all, in order" variant="accent" />
          </div>
          <PtPreview view={view} />
        </div>
      </div>

      {draft ? (
        <ProfileBuilder
          who={who}
          draft={draft}
          directories={dirs}
          onDraft={(d) => {
            setDraft(d);
            refresh().catch(() => {});
          }}
        />
      ) : (
        <>
          <PasteSteps />
          <OtherDirectories directories={dirs} />
        </>
      )}
    </div>
  );
}
