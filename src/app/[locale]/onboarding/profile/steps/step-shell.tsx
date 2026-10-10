"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useEditMode } from "./edit-mode";

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

/** Shared chrome for every wizard step: progress bar, title, nav buttons. */
export function StepShell({
  formAction,
  progressLabel,
  progressCurrent,
  progressTotal,
  title,
  hint,
  error,
  onBack,
  onSkip,
  backLabel,
  skipLabel,
  nextLabel,
  savingLabel,
  children,
}: {
  formAction: (formData: FormData) => void;
  progressLabel: string;
  progressCurrent: number;
  progressTotal: number;
  title: string;
  hint?: string;
  error?: string;
  onBack?: () => void;
  onSkip?: () => void;
  backLabel?: string;
  skipLabel?: string;
  nextLabel: string;
  savingLabel: string;
  children: React.ReactNode;
}) {
  const editMode = useEditMode();
  return (
    <form action={formAction} className="space-y-6">
      {!editMode && (
        <div className="space-y-2">
          <Progress value={progressCurrent} max={progressTotal} aria-label={progressLabel} />
          <p className="text-sm text-muted-foreground">{progressLabel}</p>
        </div>
      )}

      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </div>

      {children}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-2">
          {onBack && (
            <Button type="button" variant="ghost" onClick={onBack}>
              {backLabel}
            </Button>
          )}
          {onSkip && skipLabel && (
            <Button type="button" variant="ghost" onClick={onSkip}>
              {skipLabel}
            </Button>
          )}
        </div>
        <SubmitButton label={editMode ? editMode.saveLabel : nextLabel} pendingLabel={savingLabel} />
      </div>
    </form>
  );
}
