"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { notify } from "@/components/shared/toaster";

const NAMES: Record<string, string> = { google: "Google", instagram: "Instagram" };

/** After a sign-in comes back: one toast, then a clean address so a reload doesn't repeat it. */
export function ConnectResult({ connected, error }: { connected?: string; error?: string }) {
  const router = useRouter();
  useEffect(() => {
    if (!connected && !error) return;
    if (connected) notify.success(`${NAMES[connected] ?? "That account"} is connected.`);
    if (error) notify.error(error.slice(0, 200));
    router.replace("/settings/connections", { scroll: false });
  }, [connected, error, router]);
  return null;
}
