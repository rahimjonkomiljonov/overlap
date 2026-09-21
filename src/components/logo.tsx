import { cn } from "@/lib/utils";

/** Two overlapping circles: teal (primary) and amber (overlap). Decorative; pair with the app name. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 20"
      className={cn("h-5 w-8", className)}
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="10" cy="10" r="8" className="fill-primary" opacity="0.92" />
      <circle cx="22" cy="10" r="8" className="fill-overlap" opacity="0.92" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <LogoMark />
      <span>Overlap</span>
    </span>
  );
}
