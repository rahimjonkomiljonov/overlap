import { cn } from "@/lib/utils";

/**
 * The landing page's one memorable moment: two circles (the logo's teal and amber) slide
 * together, and the overlap between them lights up with the reasons two people would be
 * introduced. Pure CSS and rendered on the server; it plays once on load and is skipped
 * for anyone who asked for reduced motion (see the `overlap-*` rules in globals.css).
 *
 * The overlap is a real intersection, not a blend: a copy of the right circle sits inside
 * the left circle (which clips it), so the shared area can be given its own clean colour
 * and the reasons stay readable in both themes.
 *
 * The box clips sideways: the circles start offset and would otherwise poke past the screen edge
 * for the first second, letting the page scroll sideways on a phone.
 *
 * It is decorative: the same ideas are in the text next to it, so the whole graphic is hidden
 * from screen readers rather than read out as a jumble of loose words.
 *
 * The reasons are the kinds the app shows on a real introduction, written generically (no
 * names, no photos, nothing that looks like a real person).
 */
export function OverlapHero({
  youLabel,
  themLabel,
  reasons,
  className,
}: {
  youLabel: string;
  themLabel: string;
  reasons: readonly string[];
  className?: string;
}) {
  return (
    <div aria-hidden="true" className={cn("relative mx-auto aspect-[10/7] w-full max-w-sm overflow-x-clip", className)}>
      {/* Left circle: you. It clips the overlap shape below. */}
      <div className="overlap-circle-left absolute top-1/2 left-0 aspect-square w-[70%] -translate-y-1/2 overflow-hidden rounded-full bg-primary text-primary-foreground">
        <span className="absolute top-1/2 left-[21%] w-[34%] -translate-x-1/2 -translate-y-1/2 text-center text-sm leading-tight font-medium">
          {youLabel}
        </span>
      </div>

      {/* Right circle: someone else. */}
      <div className="overlap-circle-right absolute top-1/2 right-0 aspect-square w-[70%] -translate-y-1/2 rounded-full bg-overlap text-overlap-foreground">
        <span className="absolute top-1/2 right-[21%] w-[34%] translate-x-1/2 -translate-y-1/2 text-center text-sm leading-tight font-medium">
          {themLabel}
        </span>
      </div>

      {/* The overlap: the right circle's shape clipped to the left circle's, drawn above both. It
          appears once the circles have met (see .overlap-lens). The right circle starts 30% of
          the container in, which is 43% of this circle's width. */}
      <div
        aria-hidden="true"
        className="overlap-lens pointer-events-none absolute top-1/2 left-0 aspect-square w-[70%] -translate-y-1/2 overflow-hidden rounded-full"
      >
        <div className="absolute top-0 left-[42.86%] aspect-square w-full rounded-full bg-card" />
      </div>

      <ul className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5">
        {reasons.map((reason, index) => (
          <li
            key={reason}
            className="overlap-chip rounded-full bg-accent px-3 py-1 text-xs font-medium whitespace-nowrap text-accent-foreground"
            style={{ animationDelay: `${0.95 + index * 0.15}s` }}
          >
            {reason}
          </li>
        ))}
      </ul>
    </div>
  );
}
