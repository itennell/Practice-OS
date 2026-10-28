import type { ReactNode } from "react";
import { Button } from "@/components/ui";

/**
 * A Connect button: a small form that POSTs to /api/connect/<provider>/start.
 * A POST (not a link) so another website can't start a sign-in; the browser
 * sends Sec-Fetch-Site/Origin, which the route checks.
 */
export function ConnectButton({
  provider,
  scopes = [],
  variant = "accent",
  title,
  children,
}: {
  provider: "google" | "instagram";
  scopes?: string[];
  variant?: "primary" | "accent" | "quiet";
  title?: string;
  children: ReactNode;
}) {
  return (
    <form method="post" action={`/api/connect/${provider}/start`}>
      <input type="hidden" name="scopes" value={scopes.join(",")} />
      <Button type="submit" variant={variant} title={title}>
        {children}
      </Button>
    </form>
  );
}
