import type { ComponentType } from "react";
import { GoogleCard } from "./google-card";
import { InstagramCard } from "./instagram-card";
import { MuseCard } from "./muse-card";

/** One row per provider; lib/connect getConnectionStatus() fills it (until then: { provider, connected: false, scopes: [] }). */
export type ConnectionStatus = {
  provider: string;
  connected: boolean;
  accountLabel?: string;
  scopes: string[];
  expiresAt?: string;
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
];
