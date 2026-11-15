import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Designed empty state: icon, one-line title, one-line explanation, optional action. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex flex-col items-start gap-3 rounded-xl border border-dashed border-input px-6 py-10",
        className,
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-lg bg-you text-overlap-foreground">
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <h2 className="font-display text-xl font-bold tracking-tight">{title}</h2>
      {description ? <p className="max-w-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </section>
  );
}
