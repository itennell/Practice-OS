// US phone numbers in plain code: everything is stored and compared as E.164.

/** "+13125550144" from "(312) 555-0144", "312.555.0144", "1 312 555 0144"; null if it isn't a US number. */
export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10 && /^[2-9]\d{2}[2-9]/.test(digits)) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1") && /^1[2-9]\d{2}[2-9]/.test(digits)) return `+${digits}`;
  return null;
}

/** "(312) 555-0144" for the screen. */
export function prettyPhone(e164: string): string {
  const d = e164.replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : e164;
}
