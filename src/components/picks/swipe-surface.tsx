"use client";

import { Hand, X } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type SwipeDirection = "left" | "right";

/** How far a drag has to go (px) to count as a decision rather than a change of mind. */
const COMMIT_DISTANCE = 96;
/** A quick flick (px per ms) decides even when the distance is short. */
const COMMIT_VELOCITY = 0.55;
const FLICK_MIN_DISTANCE = 36;
/** Movement before we decide whether this is a sideways swipe or a vertical scroll. */
const AXIS_LOCK_DISTANCE = 10;
/** Dragging that starts on one of these is a tap or a text edit, never a swipe. */
const INTERACTIVE = "button, a, input, textarea, select, label, summary, [role='button']";

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

/**
 * Lets a card be dragged sideways: right to wave, left to pass. The card follows the finger
 * with a slight tilt, a coloured label grows as it nears the decision point, and letting go
 * early springs it back. Past the point it flies off and `onSwipe` fires once; the parent
 * owns what happens next (it keeps `leaving` set while the action runs and clears it if the
 * action fails, which brings the card back).
 *
 * Vertical scrolling is left to the browser (`touch-action: pan-y`), so a swipe never fights
 * a scroll, and anything tappable inside the card (hearts, buttons, the note box) keeps
 * working because a drag that starts on it is ignored. The buttons stay as the plain way to
 * decide, for anyone not swiping.
 */
export function SwipeSurface({
  children,
  enabled,
  leaving,
  onSwipe,
  rightLabel,
  leftLabel,
  className,
}: {
  children: ReactNode;
  enabled: boolean;
  leaving: SwipeDirection | null;
  onSwipe: (direction: SwipeDirection) => void;
  rightLabel: string;
  leftLabel: string;
  className?: string;
}) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const gesture = useRef<{ id: number; x: number; y: number; lastX: number; lastT: number; velocity: number } | null>(null);

  function begin(event: ReactPointerEvent<HTMLDivElement>) {
    if (!enabled || leaving) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if ((event.target as HTMLElement).closest(INTERACTIVE)) return;
    gesture.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      lastX: event.clientX,
      lastT: event.timeStamp,
      velocity: 0,
    };
  }

  function move(event: ReactPointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || g.id !== event.pointerId) return;
    const mx = event.clientX - g.x;
    const my = event.clientY - g.y;

    if (!dragging) {
      if (Math.abs(mx) < AXIS_LOCK_DISTANCE && Math.abs(my) < AXIS_LOCK_DISTANCE) return;
      if (Math.abs(my) > Math.abs(mx)) {
        gesture.current = null; // a vertical scroll: leave it alone
        return;
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true);
    }

    const dt = Math.max(1, event.timeStamp - g.lastT);
    // Smoothed, so one jittery sample can't turn a slow drag into a "flick".
    g.velocity = 0.7 * g.velocity + 0.3 * ((event.clientX - g.lastX) / dt);
    g.lastX = event.clientX;
    g.lastT = event.timeStamp;
    setDx(mx);
  }

  function end(event: ReactPointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || g.id !== event.pointerId) return;
    gesture.current = null;
    if (!dragging) return;
    setDragging(false);

    const distance = Math.abs(dx);
    const flick = Math.abs(g.velocity) > COMMIT_VELOCITY && distance > FLICK_MIN_DISTANCE;
    const direction = dx > 0 ? "right" : "left";
    // A flick has to agree with the side the card was dragged to.
    const flickAgrees = g.velocity > 0 === dx > 0;
    if (distance > COMMIT_DISTANCE || (flick && flickAgrees)) {
      navigator.vibrate?.(12);
      // The flight is driven by `leaving` from here on. Dropping the drag offset means that if the
      // parent takes `leaving` back (the action failed), the card returns to rest, not to where it was let go.
      setDx(0);
      onSwipe(direction);
    } else {
      setDx(0);
    }
  }

  function cancel() {
    gesture.current = null;
    setDragging(false);
    setDx(0);
  }

  const side = leaving ?? (dx > 0 ? "right" : dx < 0 ? "left" : null);
  const progress = leaving ? 1 : Math.min(1, Math.abs(dx) / COMMIT_DISTANCE);
  const shift = leaving ? (leaving === "right" ? "125%" : "-125%") : `${dx}px`;
  const tilt = reducedMotion ? 0 : leaving ? (leaving === "right" ? 12 : -12) : dx / 22;

  return (
    <div
      className={cn("relative touch-pan-y", dragging && "cursor-grabbing select-none", className)}
      style={{
        transform: `translateX(${shift}) rotate(${tilt}deg)`,
        transition: dragging ? "none" : reducedMotion ? "none" : "transform 300ms cubic-bezier(0.22, 1, 0.36, 1)",
        willChange: dragging || leaving ? "transform" : undefined,
      }}
      onPointerDown={begin}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={cancel}
      // The browser's own "drag this image" would otherwise take over a mouse drag that starts on a photo.
      onDragStart={(event) => event.preventDefault()}
    >
      {children}

      {/* The decision label: grows with the drag so it is clear what letting go will do. */}
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 rounded-xl ring-2 transition-opacity duration-100",
          side === "right" ? "bg-primary/10 ring-primary" : "bg-dating/10 ring-dating",
        )}
        style={{ opacity: side ? progress : 0 }}
      >
        {/* Sticky, so the label stays near the middle of the screen however far down a tall
            card you are when you start swiping. */}
        <div className={cn("sticky top-[30dvh] flex px-4", side === "right" ? "justify-start" : "justify-end")}>
          {side === "right" ? (
            <span className="inline-flex -rotate-6 items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-base font-bold text-primary-foreground shadow-md">
              <Hand className="size-5" />
              {rightLabel}
            </span>
          ) : (
            <span className="inline-flex rotate-6 items-center gap-1.5 rounded-full bg-dating-soft px-4 py-2 text-base font-bold text-dating-foreground shadow-md ring-2 ring-dating">
              <X className="size-5" />
              {leftLabel}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
