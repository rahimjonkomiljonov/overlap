import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

/**
 * A subtle warning-accented notice banner. Deliberately pairs the tinted background
 * with `text-foreground`, not `text-warning-foreground` — that token is designed for
 * text on a full-strength `bg-warning`, and fails contrast against a 10%-opacity tint
 * in dark mode (caught by e2e/a11y.spec.ts).
 */
export function DraftNotice({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-warning bg-warning/10 px-4 py-3 text-sm text-foreground">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}
