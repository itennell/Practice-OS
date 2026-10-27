import type { Metadata } from "next";
import AvatarLab from "@/components/shared/lab/avatar-lab";

export const metadata: Metadata = { title: "Avatar · Practice-OS UI lab" };

// Shared component check for UI-029. Not linked from the app.
export default function AvatarPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <p className="label-caps">UI lab · shared component</p>
      <h1 className="mt-2 text-title">Avatar</h1>
      <p className="mt-3 max-w-2xl text-[var(--fg-muted)]">
        The round profile picture, with initials while it loads or when there is no photo.
      </p>
      <div className="mt-8">
        <AvatarLab />
      </div>
    </main>
  );
}
