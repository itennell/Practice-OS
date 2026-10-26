import type { ComponentProps, ReactNode } from "react";

// Shared Caseload pieces (design board page 7). Built once, used on every screen.

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

export function Button({
  variant = "accent",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-full text-body transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON[variant]} ${className}`}
      {...props}
    />
  );
}

export function Chip({ on = false, children, className = "" }: { on?: boolean; children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex h-chip items-center rounded-full px-4 text-small font-medium ${
        on ? "bg-[var(--primary-bg)] text-[var(--primary-fg)]" : "border border-border bg-[var(--chip-off-bg)] text-[var(--fg)]"
      } ${className}`}
    >
      {children}
    </span>
  );
}
