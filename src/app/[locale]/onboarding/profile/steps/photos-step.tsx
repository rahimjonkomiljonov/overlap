"use client";

import Image from "next/image";
import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useEditMode } from "./edit-mode";
import {
  addPhoto,
  removePhoto,
  type AddPhotoState,
  type RemovePhotoState,
} from "@/server/profile/actions";
import { MAX_PHOTOS, MIN_PHOTOS } from "@/server/profile/schema";

const addInitialState: AddPhotoState = { status: "idle" };
const removeInitialState: RemovePhotoState = { status: "idle" };

type PhotoItem = { id: string; url: string };

export function PhotosStep({
  stepIndex,
  totalSteps,
  onNext,
  onBack,
  initialPhotos,
}: {
  stepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onBack: () => void;
  initialPhotos: PhotoItem[];
}) {
  const t = useTranslations("ProfileOnboarding");
  const editMode = useEditMode();
  const [photos, setPhotos] = useState<PhotoItem[]>(initialPhotos);
  const [addState, addAction] = useActionState(addPhoto, addInitialState);
  const [removeState, removeAction] = useActionState(removePhoto, removeInitialState);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadFormRef = useRef<HTMLFormElement>(null);

  // Adjusting state during render (React's documented pattern, see
  // waitlist-form.tsx) instead of an effect, which would trip
  // react-hooks/set-state-in-effect.
  const [lastAddState, setLastAddState] = useState(addState);
  if (addState !== lastAddState) {
    setLastAddState(addState);
    if (addState.status === "success") {
      setPhotos((prev) => [...prev, addState.photo]);
    }
  }

  const [lastRemoveState, setLastRemoveState] = useState(removeState);
  if (removeState !== lastRemoveState) {
    setLastRemoveState(removeState);
    if (removeState.status === "success") {
      const removedId = removeState.photoId;
      setPhotos((prev) => prev.filter((p) => p.id !== removedId));
    }
  }

  // Clearing the file input is a DOM mutation, not React state, so it stays in an
  // effect rather than the render-phase adjustment above.
  useEffect(() => {
    if (addState.status === "success" && fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [addState]);

  const canAdd = photos.length < MAX_PHOTOS;
  const canProceed = photos.length >= MIN_PHOTOS;
  const error =
    addState.status === "error"
      ? t(`errors.${addState.code}` as never)
      : removeState.status === "error"
        ? t(`errors.${removeState.code}` as never)
        : undefined;

  return (
    <div className="space-y-6">
      {!editMode && (
        <div className="space-y-2">
          <Progress
            value={stepIndex + 1}
            max={totalSteps}
            aria-label={t("progress", { current: stepIndex + 1, total: totalSteps })}
          />
          <p className="text-sm text-muted-foreground">
            {t("progress", { current: stepIndex + 1, total: totalSteps })}
          </p>
        </div>
      )}

      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">{t("photos.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("photos.hint")}</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {photos.map((photo) => (
          <div key={photo.id} className="relative aspect-square overflow-hidden rounded-lg bg-muted">
            <Image src={photo.url} alt="" fill sizes="200px" className="object-cover" unoptimized />
            <form action={removeAction} className="absolute top-1 right-1">
              <input type="hidden" name="photoId" value={photo.id} />
              <Button type="submit" size="icon-xs" variant="destructive" aria-label={t("photos.remove")}>
                ×
              </Button>
            </form>
          </div>
        ))}

        {canAdd && (
          <form ref={uploadFormRef} action={addAction} className="contents">
            <label className="flex aspect-square cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-border text-sm text-muted-foreground hover:bg-muted">
              {t("photos.upload")}
              <input
                ref={fileInputRef}
                type="file"
                name="photo"
                accept="image/*"
                className="sr-only"
                onChange={() => uploadFormRef.current?.requestSubmit()}
              />
            </label>
          </form>
        )}
      </div>

      <p className="text-sm text-muted-foreground">{t("photos.count", { count: photos.length })}</p>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" onClick={onBack}>
          {t("back")}
        </Button>
        <Button type="button" disabled={!canProceed} onClick={onNext}>
          {editMode ? editMode.saveLabel : t("next")}
        </Button>
      </div>
    </div>
  );
}
