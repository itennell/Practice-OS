import type { ComponentType } from "react";
import { GoogleCard } from "./google-card";
import { InstagramCard } from "./instagram-card";
import { MuseCard } from "./muse-card";
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
  { id: "instagram", order: 30, Card: InstagramCard },
  // Front Desk
  { id: "phone", order: 40, Card: PhoneConnectionCard },
  { id: "calcom", order: 50, Card: CalcomConnectionCard },
];
