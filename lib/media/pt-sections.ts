// The sections of a Psychology Today profile in the order it reads, and the fixed
// lines the interview and preview share. Plain constants only, so the browser can
// import them without pulling in the database (lib/media/pt-profile.ts has the rest).

export const WELCOME = "Welcome. Let's set up your Psychology Today profile.";
export const MAKE_IT_YOURS = "Read it and make it yours";

export const SECTIONS = [
  { id: "header", title: "Name and title" },
  { id: "statement", title: "Personal statement" },
  { id: "photos", title: "Photos" },
  { id: "consult", title: "Free consultation" },
  { id: "glance", title: "My Practice at a Glance" },
  { id: "finances", title: "Finances" },
  { id: "qualifications", title: "Qualifications" },
  { id: "specialties", title: "Specialties and Expertise" },
  { id: "endorsements", title: "Endorsements" },
  { id: "clientFocus", title: "Client Focus" },
  { id: "treatment", title: "Treatment Approach" },
  { id: "location", title: "Location" },
] as const;
export type SectionId = (typeof SECTIONS)[number]["id"];
export const SECTION_TITLE = Object.fromEntries(SECTIONS.map((s) => [s.id, s.title])) as Record<SectionId, string>;
