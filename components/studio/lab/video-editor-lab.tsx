"use client";

import { useRef, useState } from "react";
import { emptyDoc, type StudioDoc } from "@/lib/studio/doc";
import { applyOps, describeOp, OpSchema } from "@/lib/studio/ops";
import { VideoEditor } from "../video-editor";

// The video editor with an in-memory document (no database): each change runs
// through the studio's own applyOps, the same checks the server uses.
export default function VideoEditorLab() {
  const [doc, setDoc] = useState<StudioDoc>(() => ({ ...emptyDoc("video", "[Sample] A tour of the office"), title: "[Sample] Office tour" }));
  const current = useRef(doc);
  const [last, setLast] = useState<string | null>(null);
  const [why, setWhy] = useState<string | null>(null);

  async function apply(ops: unknown[]) {
    const r = applyOps(current.current, ops, { from: "canvas" });
    if (!r.ok) {
      setWhy(r.why);
      return false;
    }
    current.current = r.doc;
    setDoc(r.doc);
    setWhy(null);
    setLast(ops.map((o) => describeOp(OpSchema.parse(o))).join(", "));
    return true;
  }

  return (
    <div className="flex flex-col gap-4">
      <VideoEditor doc={doc} busy={false} apply={apply} />
      <p role="status" className="text-small text-[var(--fg-muted)]">
        {last ? `Last change: ${last}.` : "No changes yet."}
      </p>
      {why && (
        <p role="alert" className="text-small font-medium text-[var(--danger-fg)]">
          {why}
        </p>
      )}
      <pre data-testid="doc" hidden>
        {JSON.stringify(doc)}
      </pre>
    </div>
  );
}
