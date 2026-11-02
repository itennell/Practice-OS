import type { ComponentType } from "react";
import { GoogleCard } from "./google-card";
import { InstagramCard } from "./instagram-card";
import { MuseCard } from "./muse-card";
import { FRONT_DESK_ENABLED, PHONE_ENABLED } from "@/lib/features";
import { CalcomConnectionCard } from "./calcom-card";
import { PhoneConnectionCard } from "./phone-card";

/** One row per provider; lib/connect getConnectionStatus() fills it (until then: { provider, connected: false, scopes: [] }). */
export type ConnectionStatus = {
  provider: string;
  connected: boolean;
  accountLabel?: string;
  scopes: string[];
  expiresAt?: string;
  /** Set when Connect can't work on this copy yet; the card shows it instead of the button. */
  notReady?: string;
  /** Phone card only (lib/frontdesk/connect.ts phoneStatus). */
  phone?: { devLine: boolean; vendor?: string; number?: string; note?: string; fix?: string; texting?: string; voicemailOn?: boolean };
};

/** A Connect card. Each helper session adds one entry; lower order shows first. */
export type ConnectionCard = {
  id: string;
  order: number;
  Card: ComponentType<{ status: ConnectionStatus }>;
};

export const CONNECTION_CARDS: ConnectionCard[] = [
  { id: "muse", order: 0, Card: MuseCard },
  { id: "google", order: 20, Card: GoogleCard },
  // Instagram: publishing is cut for now (Isaiah, 2026-10-29). The card only says there is
  // nothing to connect (Aeon writes, she posts); relay/ stays in the repo for later.
  { id: "instagram", order: 30, Card: InstagramCard },
  // Her phone: Front Desk's line, or while Front Desk is paused only "Urgent alerts to your phone"
  // (the crisis text to her own cell needs a connected line). Cal.com is Front Desk only.
  ...(PHONE_ENABLED ? [{ id: "phone", order: 40, Card: PhoneConnectionCard }] : []),
  ...(FRONT_DESK_ENABLED ? [{ id: "calcom", order: 50, Card: CalcomConnectionCard }] : []),
];
