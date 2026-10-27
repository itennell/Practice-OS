"use client";

import { useState } from "react";
import { Button, GlassCard } from "@/components/ui";
import { Attachment, AttachmentList, type AttachmentProps } from "../attachment";

const HEADSHOT = "/demo/dana-reyes-headshot.jpg";

type Item = Omit<AttachmentProps, "onRemove"> & { id: string };

const START: Item[] = [
  { id: "a", name: "[Sample] meet-the-clinician.jpg", kind: "image", previewSrc: HEADSHOT, details: "JPEG · 1080 × 1080 · 182 KB", href: HEADSHOT },
  { id: "b", name: "[Sample] first-session.jpg", kind: "image", state: "processing", details: "Converting to JPEG…" },
  { id: "c", name: "[Sample] fees-and-superbills.png", kind: "image", state: "uploading", details: "Uploading… 40%" },
  { id: "d", name: "[Sample] hard-days.jpg", kind: "image", state: "error", error: "Blocked: mentions self-harm. Posts cover practice logistics only." },
];

export default function AttachmentLab() {
  const [items, setItems] = useState(START);
  const finish = () =>
    setItems((list) =>
      list.map((i) => (i.state === "processing" || i.state === "uploading" ? { ...i, state: "done", details: "JPEG · 1080 × 1080 · 204 KB" } : i)),
    );

  return (
    <div className="space-y-6">
      <GlassCard className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="label-caps">Instagram post composer</h2>
          <div className="flex gap-2">
            <Button variant="quiet" onClick={finish}>
              Finish processing
            </Button>
            <Button variant="quiet" onClick={() => setItems(START)}>
              Reset
            </Button>
          </div>
        </div>
        <AttachmentList label="Post images" className="mt-4">
          {items.map(({ id, ...item }) => (
            <Attachment key={id} {...item} onRemove={() => setItems((l) => l.filter((x) => x.id !== id))} />
          ))}
        </AttachmentList>
        {items.length === 0 && <p className="mt-3 text-small text-[var(--fg-muted)]">No images. Reset to bring them back.</p>}
      </GlassCard>

      <GlassCard className="p-6">
        <h2 className="label-caps">Other files</h2>
        <AttachmentList label="Other files" className="mt-4">
          <Attachment name="[Sample] BCBS-IL-provider-application.pdf" kind="pdf" details="PDF · 6 pages · 1.2 MB" href={HEADSHOT} />
          <Attachment name="[Sample] voicemail-oct-27.m4a" kind="audio" details="Audio · 0:42 · transcribed" />
        </AttachmentList>
      </GlassCard>

      <GlassCard className="p-6">
        <h2 className="label-caps">Tall cards</h2>
        <AttachmentList label="Inspiration photos" className="mt-4">
          <Attachment orientation="vertical" name="[Sample] office.jpg" kind="image" previewSrc={HEADSHOT} details="JPEG · 182 KB" onRemove={() => {}} />
          <Attachment orientation="vertical" name="[Sample] brand-colors.png" kind="image" state="processing" details="Cutting out…" />
          <Attachment orientation="vertical" name="[Sample] notes.pdf" kind="pdf" details="PDF · 2 pages" />
        </AttachmentList>
      </GlassCard>
    </div>
  );
}
