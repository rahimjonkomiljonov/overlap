import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";

/** Page title, with an optional link back to the page this one hangs off (settings pages back to Me, and so on). */
export function PageHeader({
  title,
  description,
  action,
  backHref,
  backLabel,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="mb-6">
      {backHref && backLabel ? (
        <Link
          href={backHref}
          className="-ml-1 mb-1 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {backLabel}
        </Link>
      ) : null}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-balance">
            {title}
          </h1>
          {description ? <p className="mt-1.5 text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </div>
    </div>
  );
}
