"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRefreshOnSuccess } from "@/hooks/use-refresh-on-success";
import { waveFromPocket, type PocketActionState } from "@/server/pockets/actions";
import type { PocketMember } from "@/server/pockets/queries";
import type { PocketKind } from "@/server/pockets/rules";

const idle: PocketActionState = { status: "idle" };

/** C7: people in one pocket, in join order, each with a plain profile-level wave. */
export function PocketMemberList({
  kind,
  pocketId,
  members,
}: {
  kind: PocketKind;
  pocketId: string;
  members: PocketMember[];
}) {
  return (
    <ul className="divide-y divide-border">
      {members.map((member) => (
        <MemberRow key={member.userId} kind={kind} pocketId={pocketId} member={member} />
      ))}
    </ul>
  );
}

function MemberRow({
  kind,
  pocketId,
  member,
}: {
  kind: PocketKind;
  pocketId: string;
  member: PocketMember;
}) {
  const t = useTranslations("Pockets");
  const tIntents = useTranslations("ProfileOnboarding.intents");
  const [state, action, pending] = useActionState(waveFromPocket, idle);
  useRefreshOnSuccess(state);
  const name = member.firstName ?? "?";

  return (
    <li className="flex items-center gap-3 py-3">
      <Avatar>
        {member.photoUrl && <AvatarImage src={member.photoUrl} alt="" />}
        <AvatarFallback>{name[0]}</AvatarFallback>
      </Avatar>
      <div className="mr-auto min-w-0">
        <p className="truncate font-medium">
          {name}
          {member.year !== null && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {t("year", { year: member.year })}
            </span>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {member.intents.map((i) => tIntents(`option_${i}` as never)).join(" · ")}
          {member.alsoShared > 0 && ` · ${t("alsoShared", { count: member.alsoShared })}`}
        </p>
        {state.status === "error" && (
          <p role="alert" className="text-xs text-destructive">
            {t(`errors.${state.code}` as never)}
          </p>
        )}
        {state.status === "success" && state.matched && (
          <p role="status" className="text-xs text-primary">
            {t("matchedNow")}
          </p>
        )}
      </div>
      {member.matched ? (
        <Badge>{t("matched")}</Badge>
      ) : member.waved ? (
        <Badge variant="secondary">{t("waved")}</Badge>
      ) : (
        <form action={action}>
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="pocketId" value={pocketId} />
          <input type="hidden" name="toUserId" value={member.userId} />
          <Button type="submit" size="sm" disabled={pending} aria-label={`${t("wave")}: ${name}`}>
            {t("wave")}
          </Button>
        </form>
      )}
    </li>
  );
}
