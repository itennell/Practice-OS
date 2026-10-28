"use client";

import type { ComponentType } from "react";

// Whole screens another session owns, dropped into the interview as one entry
// (kind "slot"). The desktop-app session adds "muse-key" here with one line:
//   "muse-key": ({ onDone }) => <MuseKeyStep onDone={onDone} />,
// and adds its screen to EXTRA_SCREENS in lib/onboarding/store.ts.
export type SlotProps = { onDone: () => void; onBack: () => void };

export const SLOT_COMPONENTS: Record<string, ComponentType<SlotProps>> = {};
