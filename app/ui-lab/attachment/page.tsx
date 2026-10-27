import type { Metadata } from "next";
import AttachmentLab from "@/components/shared/lab/attachment-lab";

export const metadata: Metadata = { title: "Attachment · Practice-OS UI lab" };

// Shared component check for UI-023. Not linked from the app.
export default function AttachmentPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <p className="label-caps">UI lab · shared component</p>
      <h1 className="mt-2 text-title">Attachment</h1>
      <p className="mt-3 max-w-2xl text-[var(--fg-muted)]">
        One card for every image or file: uploading, processing, ready, or failed with the reason.
      </p>
      <div className="mt-8">
        <AttachmentLab />
      </div>
    </main>
  );
}
