import { connection } from "next/server";
import { Suspense } from "react";
import { MediaTabs } from "@/components/media/media-tabs";
import { instagramDeclined } from "@/lib/instagram/onboarding";

// Media (the Instagram helper grown up): where she lists herself, her website,
// and Instagram. Each tab keeps its own heading; this adds the tab row above it.
// Media is for everyone; if she said Instagram isn't for her, its tab is left out.
export default function MediaLayout({ children }: LayoutProps<"/media">) {
  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-6">
      <Suspense fallback={<MediaTabs hideInstagram={false} />}>
        <Tabs />
      </Suspense>
      {children}
    </div>
  );
}

async function Tabs() {
  await connection(); // read the database per request, never at build time
  return <MediaTabs hideInstagram={await instagramDeclined().catch(() => false)} />;
}
