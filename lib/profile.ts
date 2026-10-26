import { db } from "./db";

export type Profile = {
  full_name: string;
  credential: string;
  practice_name: string;
  practice_stage: "beginning" | "middle" | "late";
  neighborhood: string | null;
  city: string;
  is_sample: boolean;
};

export async function getProfile(): Promise<Profile | null> {
  const [row] = await db()<Profile[]>`
    select full_name, credential, practice_name, practice_stage, neighborhood, city, is_sample
    from practice_os.clinician_profile limit 1`;
  return row ?? null;
}

export const STAGE_LABEL: Record<Profile["practice_stage"], string> = {
  beginning: "Beginning: just opening",
  middle: "Middle: building a caseload",
  late: "Late: established",
};
