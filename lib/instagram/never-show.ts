// Her "never show" picks from onboarding (face, office, family, home), checked in
// plain code, not only asked of the model: a post or idea whose picture description
// or caption shows one is fixed or blocked before she sees it.

const NEVER_WORDS: Record<string, RegExp> = {
  face: /\b(face|faces|selfie|headshot|portrait|photo of (her|you|me|the (therapist|clinician|counselor))|smil(e|es|ing)|(therapist|clinician|counselor) (sitting|standing|smiling|at)|her picture)\b/i,
  office: /\b(office|desk|therapy room|waiting room|couch|consult(ation)? room)\b/i,
  family: /\b(family|kids?|children|child|son|daughter|husband|wife|partner|spouse)\b/i,
  home: /\b(home|house|kitchen|living room|bedroom|backyard)\b/i,
};

/**
 * Which of her never-show picks this text shows. Her first name counts as her face.
 * `only` limits the check: a caption may say where the office is or that video
 * sessions work from home (that's logistics), so captions check face and family only.
 */
export function neverShowHits(text: string, neverShow: string[], opts: { firstName?: string; only?: string[] } = {}): string[] {
  return neverShow.filter(
    (n) =>
      (!opts.only || opts.only.includes(n)) &&
      (NEVER_WORDS[n]?.test(text) || (n === "face" && opts.firstName && new RegExp(`\\b${opts.firstName}\\b`, "i").test(text) && !opts.only)),
  );
}
