import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-balance">{title}</h1>
        {description ? <p className="mt-1 text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
