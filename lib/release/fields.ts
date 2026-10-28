import { z } from "zod";
import { toDate } from "../compliance/dates";

// What Aeon may fill on an Illinois consent to release form (740 ILCS 110/5):
// who receives it, why, exactly what, and the calendar date it ends. Never the
// client: their name and birth date stay blank boxes she fills in herself.
// Nothing here is saved anywhere (docs/research.md > Illinois release form).

/** 740 ILCS 110/5(c): "Blanket consent to the disclosure of unspecified information shall not be valid." */
const BLANKET = /\b(all|any|entire|complete|whole|every)\b[^.]{0,30}\b(records?|information|files?|chart|notes|documents?)\b|\bany and all\b|\bwhole chart\b/i;

export function isBlanket(text: string): boolean {
  return BLANKET.test(text);
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD").refine((d) => {
  try {
    toDate(d);
    return true;
  } catch {
    return false;
  }
}, "Not a real date");

export const releaseFieldsSchema = z
  .object({
    recipient: z.string().trim().max(160).optional(),
    recipient_address: z.string().trim().max(200).optional(),
    purpose: z.string().trim().max(300).optional(),
    information: z
      .string()
      .trim()
      .max(400)
      .optional()
      .refine((t) => !t || !isBlanket(t), "Name exactly what to release. A blanket release like \"all records\" isn't valid in Illinois (740 ILCS 110/5(c))."),
    /** 110/5(b)(6): a calendar date, required. */
    expires_on: isoDate,
  })
  .strict();
export type ReleaseFields = z.infer<typeof releaseFieldsSchema>;

/** Checks the expiration against today: it has to be a future calendar date. */
export function checkReleaseFields(input: unknown, today: string): ReleaseFields {
  const parsed = releaseFieldsSchema.safeParse(input);
  if (!parsed.success) {
    const missing = parsed.error.issues.some((i) => i.path[0] === "expires_on");
    throw new Error(
      missing
        ? "A release form needs a calendar date when the consent ends (740 ILCS 110/5(b)(6)). Without one, Illinois law lets it be used only on the day it arrives."
        : parsed.error.issues.map((i) => i.message).join(" "),
    );
  }
  if (parsed.data.expires_on <= today) throw new Error("The expiration date must be after today.");
  return parsed.data;
}
