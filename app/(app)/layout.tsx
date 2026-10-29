import { connection } from "next/server";
import { Suspense } from "react";
import { AskAeonButton } from "@/components/shared/ask-aeon-button";
import { Toaster } from "@/components/shared/toaster";
import { Sidebar } from "@/components/sidebar";
import { loadMenuData } from "@/lib/ui/menu";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Suspense fallback={<Sidebar />}>
        <LoadedSidebar />
      </Suspense>
      <main id="main" className="mx-auto flex w-full min-w-0 max-w-[1200px] flex-1 flex-col gap-6 px-5 py-6 md:px-10 md:py-10">
        {children}
        <AskAeonButton />
      </main>
      <Toaster />
    </div>
  );
}

async function LoadedSidebar() {
  await connection(); // read the database per request, never at build time
  return <Sidebar initial={await loadMenuData()} />;
}
