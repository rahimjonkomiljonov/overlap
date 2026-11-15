import { cn } from "@/lib/utils";

/**
 * Two timetable blocks, one highlighted yellow ("you") and one blue ("them"), with the part they share
 * in green. Decorative; pair with the app name.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 24" className={cn("h-6 w-8", className)} aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="20" height="16" rx="4" className="fill-you" />
      <rect x="11" y="7" width="20" height="16" rx="4" className="fill-them" />
      <path d="M11 11a4 4 0 0 1 4-4h6v6a4 4 0 0 1-4 4h-6z" className="fill-overlap" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-display text-xl font-extrabold tracking-tight", className)}>
      <LogoMark />
      <span>overlap</span>
    </span>
  );
}
