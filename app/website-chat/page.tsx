import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { WebsiteChat } from "@/components/front-desk/website-chat";
import { FRONT_DESK_ENABLED } from "@/lib/features";
import { practice } from "@/lib/frontdesk/store";
import { webChatGreeting } from "@/lib/frontdesk/templates";

export const metadata = { title: "Website chat · Practice-OS" };

// What a visitor to her practice website sees: Front Desk's chat, typing only,
// no sidebar, no Aeon. It says it is an AI assistant before anything else.
// Only on her own computer for now: proxy.ts answers 404 on the Vercel copy,
// and this page refuses there too.
export default function WebsiteChatPage() {
  if (!FRONT_DESK_ENABLED) notFound(); // Front Desk is paused (lib/features.ts)
  return (
    <main id="main" className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-4 bg-[var(--bg)] px-4 py-6 md:py-10">
      <Suspense fallback={<p className="text-[var(--fg-muted)]">Loading the chat…</p>}>
        <Loaded />
      </Suspense>
    </main>
  );
}

async function Loaded() {
  await connection(); // the practice name comes from the database, per request
  if (process.env.VERCEL) notFound();
  const p = await practice();
  return <WebsiteChat practiceName={p.practiceName} greeting={webChatGreeting(p)} />;
}
