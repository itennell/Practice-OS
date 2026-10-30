import type { Metadata } from "next";
import VideoEditorLab from "@/components/studio/lab/video-editor-lab";

export const metadata: Metadata = { title: "Video editor · Practice-OS UI lab" };

// Test page for the studio's video editor (her own footage). Not linked from the app.
export default function StudioVideoPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <p className="label-caps">UI lab · studio</p>
      <h1 className="mt-2 text-title">Video editor</h1>
      <p className="mt-3 max-w-2xl text-[var(--fg-muted)]">
        [Sample] Add a video from this computer, trim it, put words on it and download the MP4. The video stays in this browser.
      </p>
      <div className="mt-8">
        <VideoEditorLab />
      </div>
    </main>
  );
}
