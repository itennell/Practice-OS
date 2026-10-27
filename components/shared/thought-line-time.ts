// Thought Line (UI-014) timer wording, kept free of React so it can be unit tested.

/** "4.2s" up to a minute, then "1m 3.0s". Input in tenths of a second. */
export function formatTenths(ds: number): string {
  return ds < 600 ? `${(ds / 10).toFixed(1)}s` : `${Math.floor(ds / 600)}m ${((ds % 600) / 10).toFixed(1)}s`;
}

/** The same, in words for screen readers. */
export function spokenTenths(ds: number): string {
  if (ds < 600) return `${(ds / 10).toFixed(1)} seconds`;
  const m = Math.floor(ds / 600);
  return `${m} minute${m === 1 ? "" : "s"} ${((ds % 600) / 10).toFixed(1)} seconds`;
}
