// Shared helpers for the shipped rule files.

/** The day the shipped rules were last read on their source pages. */
export const CHECKED = "2026-10-26";

export function src(citation: string, url: string, quote?: string) {
  return { citation, url, ...(quote ? { quote } : {}), checked_on: CHECKED };
}
