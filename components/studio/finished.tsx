"use client";

// The bottom of the canvas: Approve or Decline while it waits for her, then the
// big download and copy buttons and how to post it herself. Nothing is posted:
// publishing is cut for now, she posts it from her phone.

import { Copy, Download, Film } from "lucide-react";
import { useState } from "react";
import type { Project } from "@/lib/studio/store";
import { ThoughtLine } from "../shared/thought-line";
import { Button, ButtonLink } from "../ui";
import type { PostState } from "../instagram/post-state";
import { canMakeVideo, renderSlideReel, saveBlob, slideJpeg, type DrawAssets } from "./slide-draw";

const STEPS = {
  picture: ["Download the picture, and keep it on your phone.", "Tap Copy caption.", "Open the Instagram app and tap +.", "Pick the picture, then paste the caption.", "Tap Share."],
  carousel: ["Download each slide, and keep them on your phone.", "Tap Copy caption.", "Open the Instagram app and tap +.", "Pick the slides in order, then paste the caption.", "Tap Share."],
  video: ["Download the video, and keep it on your phone.", "Tap Copy caption.", "Open the Instagram app, tap +, then Reel.", "Pick the video, then paste the caption.", "Tap Share."],
};

function Decide({ project, onChange }: { project: Project; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  async function decide(action: "approve" | "decline") {
    setBusy(true);
    setProblem(null);
    try {
      const res = await fetch(`/api/approvals/${project.approvalId}/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setProblem(data.error ?? "That didn't work. Try again.");
    } catch {
      setProblem("Couldn't reach Practice-OS. Check that the app is running, then try again.");
    } finally {
      setBusy(false);
      onChange();
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-small text-[var(--fg-muted)]">Nothing is posted. Approve it when you like it, and it&apos;s ready for you to post yourself.</p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="accent" disabled={busy} onClick={() => decide("approve")}>
          Approve
        </Button>
        <Button variant="quiet" disabled={busy} onClick={() => decide("decline")}>
          Decline
        </Button>
      </div>
      {problem && (
        <p role="alert" className="text-small font-medium" style={{ color: "var(--danger-fg)" }}>
          {problem}
        </p>
      )}
    </div>
  );
}

export function Finished({ project, assets, state, onChange }: { project: Project; assets: DrawAssets; state: PostState | null; onChange: () => void }) {
  const doc = project.doc;
  const [copied, setCopied] = useState<"" | "yes" | "no">("");
  const [making, setMaking] = useState<number | null>(null);
  const [problem, setProblem] = useState("");
  if (state === "waiting") return <Decide project={project} onChange={onChange} />;
  // A video of her own footage has no approval (Aeon didn't write it); its download lives in the video editor.
  if (doc.kind === "video" || state !== "ready") return null;

  const picture = `/api/studio/${project.id}/picture?download=1&v=${doc.picture}`;
  const name = (doc.title || "instagram").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);

  async function video() {
    setProblem("");
    if (!(await canMakeVideo(doc.aspect))) return setProblem("Your browser can't make videos; use Chrome or Safari.");
    setMaking(0);
    try {
      saveBlob(await renderSlideReel(doc, assets, setMaking), `${name}.mp4`);
    } catch {
      setProblem("The video didn't finish. Try again.");
    } finally {
      setMaking(null);
    }
  }
  // One click per slide: browsers block a burst of downloads from one click.
  async function slide(i: number) {
    setProblem("");
    try {
      saveBlob(await slideJpeg(doc, i, assets), `${name}-${i + 1}.jpg`);
    } catch {
      setProblem(`Slide ${i + 1} didn't download. Try again.`);
    }
  }

  return (
    <div className="flex flex-col gap-4 border-t border-[var(--hairline)] pt-4" data-testid="finished">
      <p className="font-semibold">Ready for you to post yourself</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button
          variant="primary"
          className="w-full"
          onClick={() =>
            navigator.clipboard
              .writeText(doc.caption)
              .then(() => setCopied("yes"))
              .catch(() => setCopied("no"))
          }
        >
          <Copy aria-hidden size={18} /> Copy caption
        </Button>
        {doc.kind === "post" && (
          <>
            <ButtonLink variant="primary" className="w-full" href={picture} download>
              <Download aria-hidden size={18} /> Download picture
              <span className="sr-only"> (feed 4:5, JPEG)</span>
            </ButtonLink>
            <ButtonLink variant="primary" className="w-full sm:col-span-2" href={`${picture}&shape=square`} download>
              <Download aria-hidden size={18} /> Download square picture
              <span className="sr-only"> (1:1, JPEG)</span>
            </ButtonLink>
          </>
        )}
        {doc.kind === "carousel" &&
          doc.slides.map((s, i) => (
            <Button key={s.id} variant="primary" className="w-full" onClick={() => slide(i)}>
              <Download aria-hidden size={18} /> Download slide {i + 1} of {doc.slides.length}
            </Button>
          ))}
        {doc.kind === "reel" && (
          <Button variant="primary" className="w-full" onClick={video} disabled={making !== null}>
            <Film aria-hidden size={18} /> {making === null ? "Download video" : "Making the video…"}
          </Button>
        )}
      </div>
      {making !== null && <ThoughtLine working label={`Making the video in your browser… ${Math.round(making * 100)}%`} />}
      <p role="status" aria-live="polite" className={copied || problem ? "text-small font-medium" : "sr-only"} style={problem ? { color: "var(--danger-fg)" } : undefined}>
        {problem || (copied === "yes" ? "Caption copied." : copied === "no" ? "Couldn't copy. Select the caption above and copy it." : "")}
      </p>
      <div className="flex flex-col gap-2">
        <h3 className="font-semibold">How to post it</h3>
        <ol className="flex list-decimal flex-col gap-1 pl-6 text-small">
          {STEPS[doc.kind === "reel" ? "video" : doc.kind === "carousel" ? "carousel" : "picture"].map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}
