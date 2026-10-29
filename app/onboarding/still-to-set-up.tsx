import { ListTodo } from "lucide-react";
import { ListCard, ListRow } from "@/components/shared/list-card";
import { ButtonLink } from "@/components/ui";
import { stillToSetUp } from "@/lib/onboarding/store";

// On the chat home after onboarding: what she skipped or put off, each one a link back
// to that one question. Hidden when nothing is left.
export async function StillToSetUp() {
  const items = await stillToSetUp().catch(() => []);
  if (items.length === 0) return null;
  return (
    <ListCard id="still-to-set-up" label="Still to set up">
      {items.slice(0, 6).map((item) => (
        <ListRow
          key={item.id}
          icon={<ListTodo size={16} strokeWidth={1.75} />}
          title={item.ask}
          detail={item.why ?? item.chapter}
          end={
            <ButtonLink variant="quiet" href={`/onboarding?q=${encodeURIComponent(item.id)}`}>
              Answer
            </ButtonLink>
          }
        />
      ))}
      {items.length > 6 && <li className="border-t border-[var(--line)] px-4 py-3 text-small text-[var(--fg-muted)]">And {items.length - 6} more.</li>}
    </ListCard>
  );
}
