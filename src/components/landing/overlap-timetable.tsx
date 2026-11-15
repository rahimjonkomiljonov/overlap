import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";

const FIRST_HOUR = 9;
const HOURS = [9, 10, 11, 12, 13, 14, 15, 16];

type Block = { day: number; from: number; to: number; label: string };

/** Grid placement: column 1 is the hour gutter, row 1 the day names. */
function place({ day, from, to }: Block) {
  return { gridColumn: day + 2, gridRow: `${from - FIRST_HOUR + 2} / ${to - FIRST_HOUR + 2}` };
}

const blockClass = "m-px overflow-hidden rounded-md px-1.5 py-1 text-[0.6875rem] leading-tight font-semibold text-overlap-foreground sm:px-2 sm:py-1.5 sm:text-xs";

/**
 * The landing page's picture of the idea: one week, your classes highlighted in yellow, another student's
 * in blue, and the three places the two weeks cross in green (a shared class, a shared club, the same free
 * hours). The blue week slides in over yours once, then the shared blocks turn green. One image to a
 * screen reader; the blocks themselves are hidden from it.
 */
export async function OverlapTimetable({ className }: { className?: string }) {
  const t = await getTranslations("Home");
  const days = t.raw("ttDays") as string[];

  const yours: Block[] = [
    { day: 0, from: 9, to: 11, label: t("ttLinear") },
    { day: 1, from: 10, to: 12, label: t("ttData") },
    { day: 2, from: 13, to: 15, label: t("ttHistory") },
    { day: 2, from: 15, to: 17, label: t("ttClub") },
    { day: 3, from: 9, to: 11, label: t("ttEnglish") },
    { day: 4, from: 10, to: 12, label: t("ttPhysics") },
  ];
  const theirs: Block[] = [
    { day: 0, from: 13, to: 15, label: t("ttDesign") },
    { day: 1, from: 10, to: 12, label: t("ttData") },
    { day: 2, from: 9, to: 11, label: t("ttStats") },
    { day: 2, from: 15, to: 17, label: t("ttClub") },
    { day: 3, from: 13, to: 15, label: t("ttMarketing") },
    { day: 4, from: 9, to: 10, label: t("ttWriting") },
  ];
  const shared: (Block & { why: string; free?: boolean })[] = [
    { day: 1, from: 10, to: 12, label: t("ttData"), why: t("ttSameClass") },
    { day: 2, from: 15, to: 17, label: t("ttClub"), why: t("ttSameClub") },
    { day: 4, from: 14, to: 16, label: t("ttFree"), why: t("ttSameHour"), free: true },
  ];

  return (
    <figure className={cn("rounded-2xl border bg-card p-3 shadow-soft sm:p-5", className)}>
      <div
        role="img"
        aria-label={t("ttCaption")}
        className="grid grid-cols-[1.5rem_repeat(5,minmax(0,1fr))] grid-rows-[1.75rem_repeat(8,2.5rem)] sm:grid-cols-[2rem_repeat(5,minmax(0,1fr))] sm:grid-rows-[2rem_repeat(8,3rem)]"
      >
        {days.map((day, index) => (
          <span
            key={day}
            aria-hidden="true"
            style={{ gridColumn: index + 2, gridRow: 1 }}
            className="self-center text-center text-xs font-semibold text-muted-foreground"
          >
            {day}
          </span>
        ))}
        {HOURS.map((hour, index) => (
          <span
            key={hour}
            aria-hidden="true"
            style={{ gridColumn: "1 / -1", gridRow: index + 2 }}
            className="border-t border-border/70 pt-0.5 text-[0.625rem] text-muted-foreground tabular-nums"
          >
            {hour}
          </span>
        ))}

        {yours.map((block) => (
          <span key={`you-${block.day}-${block.from}`} aria-hidden="true" style={place(block)} className={cn(blockClass, "bg-you")}>
            {block.label}
          </span>
        ))}
        {theirs.map((block) => (
          <span
            key={`them-${block.day}-${block.from}`}
            aria-hidden="true"
            style={place(block)}
            className={cn(blockClass, "timetable-them bg-them")}
          >
            {block.label}
          </span>
        ))}
        {shared.map((block) => (
          <span
            key={`both-${block.day}-${block.from}`}
            aria-hidden="true"
            style={place(block)}
            className={cn(
              blockClass,
              "timetable-overlap flex flex-col justify-between",
              block.free ? "border-2 border-dashed border-overlap bg-overlap-soft text-foreground" : "bg-overlap",
            )}
          >
            <span>{block.label}</span>
            <span className="font-medium opacity-80">{block.why}</span>
          </span>
        ))}
      </div>

      <figcaption className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 border-t pt-3 text-sm sm:mt-4 sm:pt-4">
        {(
          [
            ["bg-you", t("ttYou")],
            ["bg-them", t("ttThem")],
            ["bg-overlap", t("ttBoth")],
          ] as const
        ).map(([swatch, label]) => (
          <span key={swatch} className="inline-flex items-center gap-2">
            <span aria-hidden="true" className={cn("size-3.5 rounded-[4px]", swatch)} />
            {label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
