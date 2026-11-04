// The request checks live in lib/request-guard.ts, which proxy.ts applies to
// every request; the Muse key route still calls them directly as a second layer.
export { isLocalAppRequest, isLocalRequest, isSameOrigin } from "../request-guard";
