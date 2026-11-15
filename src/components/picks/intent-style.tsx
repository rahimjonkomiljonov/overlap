import { BookOpen, Heart, Sparkles, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type IntentKey = "FRIENDS" | "STUDY" | "DATING" | "OPEN";

/**
 * One colour and one icon per way of meeting, used wherever a mode is shown (headings on the
 * picks page, the card's accent, the mode picker). The class names are written out in full on
 * purpose: Tailwind only generates classes it can find as literal strings.
 */
export const INTENT_STYLE: Record<
  IntentKey,
  { icon: LucideIcon; chip: string; bar: string; border: string; text: string }
> = {
  FRIENDS: {
    icon: Users,
    chip: "bg-friends-soft text-friends-foreground",
    bar: "bg-friends",
    border: "border-friends",
    text: "text-friends-foreground",
  },
  STUDY: {
    icon: BookOpen,
    chip: "bg-study-soft text-study-foreground",
    bar: "bg-study",
    border: "border-study",
    text: "text-study-foreground",
  },
  DATING: {
    icon: Heart,
    chip: "bg-dating-soft text-dating-foreground",
    bar: "bg-dating",
    border: "border-dating",
    text: "text-dating-foreground",
  },
  OPEN: {
    icon: Sparkles,
    chip: "bg-open-soft text-open-foreground",
    bar: "bg-open",
    border: "border-open",
    text: "text-open-foreground",
  },
};

/** The mode's icon on its own tinted disc (for lists and headings). */
export function IntentIcon({ intent, className }: { intent: IntentKey; className?: string }) {
  const { icon: Icon, chip } = INTENT_STYLE[intent];
  return (
    <span className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-md", chip, className)}>
      <Icon className="size-4" aria-hidden="true" />
    </span>
  );
}

/** Icon plus name on a tinted pill, e.g. the heading above each mode's picks. */
export function IntentBadge({ intent, label, className }: { intent: IntentKey; label: string; className?: string }) {
  const { icon: Icon, chip } = INTENT_STYLE[intent];
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-base font-semibold", chip, className)}>
      <Icon className="size-4.5" aria-hidden="true" />
      {label}
    </span>
  );
}
