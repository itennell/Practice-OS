"use client";

import { useSyncExternalStore } from "react";
import { SettingSwitch } from "@/components/shared/settings-controls";

// "Larger text" (125%) for the whole app. Kept in this computer's browser storage and
// put on <html data-text-size> before the first paint by the script in app/layout.tsx.
export const TEXT_SIZE_KEY = "po-text-size";

const listeners = new Set<() => void>();
const read = () => (typeof document !== "undefined" && document.documentElement.dataset.textSize === "large" ? "large" : "normal");

function set(size: "large" | "normal") {
  try {
    if (size === "large") localStorage.setItem(TEXT_SIZE_KEY, "large");
    else localStorage.removeItem(TEXT_SIZE_KEY);
  } catch {
    // Private windows can refuse storage; the switch still works for this visit.
  }
  if (size === "large") document.documentElement.dataset.textSize = "large";
  else delete document.documentElement.dataset.textSize;
  listeners.forEach((l) => l());
}

export function TextSizeSwitch() {
  const size = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => "normal",
  );
  return (
    <SettingSwitch
      label="Larger text"
      description="Makes the words bigger everywhere in the app."
      checked={size === "large"}
      onCheckedChange={(on) => set(on ? "large" : "normal")}
    />
  );
}
