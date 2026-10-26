// Placeholder until the onboarding interview is built. Shows the design tokens.
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 px-6 py-16">
      <section className="glass flex flex-col items-center gap-6 p-10 text-center">
        <div className="orb h-28 w-28" aria-hidden />
        <h1 className="text-3xl font-semibold tracking-tight">Hi, I&apos;m Aeon.</h1>
        <p className="max-w-md text-[color:var(--fg-muted)]">
          Your practice co-owner. Setup is coming soon.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <button className="h-btn-primary rounded-full bg-primary px-7 font-semibold text-white">
            Get started
          </button>
          <button className="h-btn-accent rounded-full bg-accent px-6 font-semibold text-white hover:bg-accent-hover">
            Accent
          </button>
          <span className="flex h-chip items-center rounded-full border border-border px-4 text-sm">
            Chip
          </span>
        </div>
      </section>

      <section className="glass flex flex-wrap items-center justify-center gap-6 p-6 text-sm">
        <span className="flex items-center gap-2">
          <span className="orb-front-desk h-8 w-8" aria-hidden /> Front Desk
        </span>
        <span className="flex items-center gap-2">
          <span className="orb-referrals h-8 w-8" aria-hidden /> Referrals
        </span>
        <span className="flex items-center gap-2">
          <span className="orb-instagram h-8 w-8" aria-hidden /> Instagram
        </span>
        <span className="font-medium text-success">Success</span>
      </section>
    </main>
  );
}
