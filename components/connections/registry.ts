import type { ComponentType } from "react";
import { MuseCard } from "./muse-card";

/** One row per provider; lib/connect/status.ts getConnectionStatus() fills it. */
export type ConnectionStatus = {
  provider: string;
  connected: boolean;
  accountLabel?: string;
  scopes: string[];
  expiresAt?: string;
  /** Set when Connect can't work on this copy yet; the card shows it instead of the button. */
  notReady?: string;
};

/** A Connect card; lower order shows first. */
export type ConnectionCard = {
  id: string;
  order: number;
  Card: ComponentType<{ status: ConnectionStatus }>;
};

/** Her own Muse key is the one connection: the brain Aeon thinks with. */
export const CONNECTION_CARDS: ConnectionCard[] = [{ id: "muse", order: 0, Card: MuseCard }];
