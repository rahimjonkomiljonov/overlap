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
        "flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-card px-6 py-12 text-center",
        className,
      )}
    >
      <span className="flex size-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <Icon className="size-7" aria-hidden="true" />
      </span>
      <h2 className="text-lg font-semibold">{title}</h2>
      {description ? <p className="max-w-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </section>
  );
}
