"use client";

// A form opens in a panel on the right of Admin, never as the page itself (redesign
// plan, frame 3). The panel lives in the URL (/admin?panel=gfe) so a needs-next button
// or Aeon can link straight to a filled form; closing it goes back to /admin, or to the
// chat she came from when the link carries &back=/?c=<chat> (app paths only). Files
// uses the same panel with home="/files". The panel itself is the shared SideSheet.

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { SideSheet } from "@/components/shared/side-sheet";

export function SidePanel({ title, description, children, home = "/admin" }: { title: string; description?: string; children: ReactNode; home?: string }) {
  const router = useRouter();
  const back = useSearchParams().get("back");
  const closeTo = back && /^\/(?![/\\])[^\s\\]*$/.test(back) ? back : home;
  const [open, setOpen] = useState(true);
  return (
    <SideSheet
      open={open}
      title={title}
      description={description}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) router.push(closeTo, { scroll: false });
      }}
    >
      {children}
    </SideSheet>
  );
}
