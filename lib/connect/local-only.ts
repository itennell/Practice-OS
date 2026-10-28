// The request checks moved to lib/request-guard.ts, which proxy.ts applies to
// every request; Connect routes still call them directly as a second layer.
export { isLocalAppRequest, isLocalRequest, isSameOrigin } from "../request-guard";

export const PROVIDERS = ["google", "instagram"] as const;
export const isConnectProvider = (p: string): p is (typeof PROVIDERS)[number] => (PROVIDERS as readonly string[]).includes(p);
