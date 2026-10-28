"use client";

import type { ComponentType } from "react";
import { MuseKeyStep } from "@/components/onboarding/muse-key-step";

// Whole screens another session owns, dropped into the interview as one entry
// (kind "slot"); the shell still shows Back, Skip and Set up later around them.
export type SlotProps = { onDone: () => void; onBack: () => void };

export const SLOT_COMPONENTS: Record<string, ComponentType<SlotProps>> = {
  "muse-key": ({ onDone }) => <MuseKeyStep onDone={onDone} />,
};
