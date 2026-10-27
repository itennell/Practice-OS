import type { Metadata } from "next";
import BlobLab from "@/components/agent-blob/blob-lab";

export const metadata: Metadata = { title: "Liquid Aeon test · Practice-OS UI lab" };

// Standalone test for UI-017. Not linked from the app until Isaiah approves it.
export default function LiquidAeonTest() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <p className="label-caps">UI lab · test</p>
      <h1 className="mt-2 text-title">Liquid Aeon</h1>
      <p className="mt-3 max-w-2xl text-[var(--fg-muted)]">
        Aeon rests and breathes, splashes when it pops up, and wobbles while it works. The helper agents use the same blob in
        their own colours.
      </p>
      <div className="mt-8">
        <BlobLab />
      </div>
    </main>
  );
}
