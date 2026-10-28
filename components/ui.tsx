import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";

// Shared pieces (UI-004). Built once, used on every screen. Links that look like
// buttons or chips use ButtonLink / ChipLink, never their own pill classes.

export function Orb({ size = 40, className = "" }: { size?: number; className?: string }) {
  return <span aria-hidden className={`orb inline-block shrink-0 ${className}`} style={{ width: size, height: size }} />;
}

export function GlassCard({ className = "", ...props }: ComponentProps<"section">) {
  return <section className={`glass ${className}`} {...props} />;
}

type ButtonVariant = "primary" | "accent" | "quiet";

const BUTTON: Record<ButtonVariant, string> = {
  // Primary pill: dark, 52px. Accent: 44px #5B47C9. Quiet: chip-off look, 44px.
  primary:
    "h-btn-primary px-7 bg-[var(--primary-bg)] text-[var(--primary-fg)] hover:bg-[var(--primary-hover)] font-semibold",
  accent: "h-btn-accent px-6 bg-accent text-white hover:bg-accent-hover font-semibold",
  quiet:
    "h-touch px-5 bg-[var(--chip-off-bg)] text-[var(--fg)] border border-border hover:border-accent font-medium",
};

export const buttonClass = (variant: ButtonVariant = "accent", className = "") =>
  `inline-flex items-center justify-center gap-2 rounded-full text-body transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON[variant]} ${className}`;

export function Button({
  variant = "accent",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return <button className={buttonClass(variant, className)} {...props} />;
}

/** A link that looks like a Button. Plain <a> for downloads and other sites; next/link inside the app. */
export function ButtonLink({
  variant = "accent",
  className = "",
  href,
  ...props
}: ComponentProps<"a"> & { href: string; variant?: ButtonVariant }) {
  const cls = buttonClass(variant, className);
  if (href.startsWith("/") && !href.startsWith("/api/") && !props.download) return <Link href={href} className={cls} {...props} />;
  return <a href={href} className={cls} {...props} />;
}

/** Chip look: selected chips are dark, unselected stay white with a border. `touch` makes it 44px for tabs and filters. */
export const chipClass = (on: boolean, touch = false, className = "") =>
  `inline-flex ${touch ? "h-touch px-5 text-body" : "h-chip px-4 text-small"} items-center rounded-full font-medium transition-colors duration-150 ${
    on ? "bg-[var(--primary-bg)] text-[var(--primary-fg)]" : "border border-border bg-[var(--chip-off-bg)] text-[var(--fg)] hover:border-[var(--fg-muted)]"
  } ${className}`;

export function Chip({ on = false, children, className = "" }: { on?: boolean; children: ReactNode; className?: string }) {
  return <span className={chipClass(on, false, className)}>{children}</span>;
}

/** A chip used as a tab or filter link (44px). Marks the current one with aria-current. */
export function ChipLink({ on = false, href, children, className = "" }: { on?: boolean; href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} aria-current={on ? "page" : undefined} className={chipClass(on, true, className)}>
      {children}
    </Link>
  );
}
