import { ButtonLink } from "@/components/ui";
import { stillToSetUp } from "@/lib/onboarding/store";

// On the chat home after onboarding: what she skipped or put off, each one a link back
// to that one question. Hidden when nothing is left.
export async function StillToSetUp() {
  const items = await stillToSetUp().catch(() => []);
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="still-to-set-up" className="glass flex flex-col gap-3 p-5">
      <h2 id="still-to-set-up" className="text-section">
        Still to set up
      </h2>
      <ul className="flex flex-col divide-y divide-[var(--hairline)]">
        {items.slice(0, 6).map((item) => (
          <li key={item.id} className="flex flex-wrap items-center gap-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-body">{item.ask}</p>
              <p className="text-small text-[var(--fg-muted)]">{item.why ?? item.chapter}</p>
            </div>
            <ButtonLink variant="quiet" href={`/onboarding?q=${encodeURIComponent(item.id)}`}>
              Answer
            </ButtonLink>
          </li>
        ))}
      </ul>
      {items.length > 6 && <p className="text-small text-[var(--fg-muted)]">And {items.length - 6} more.</p>}
    </section>
  );
}
