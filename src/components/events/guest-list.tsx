"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRefreshOnSuccess } from "@/hooks/use-refresh-on-success";
import { connectAtEvent, type EventActionState } from "@/server/events/actions";
import type { Guest } from "@/server/events/queries";

const idle: EventActionState = { status: "idle" };

/** F2 "who's going", with F3's "we met" picks during the connect window. */
export function GuestList({
  eventId,
  guests,
  canConnect,
}: {
  eventId: string;
  guests: Guest[];
  canConnect: boolean;
}) {
  return (
    <ul className="divide-y divide-border">
      {guests.map((guest) => (
        <GuestRow key={guest.userId} eventId={eventId} guest={guest} canConnect={canConnect} />
      ))}
    </ul>
  );
}

function GuestRow({
  eventId,
  guest,
  canConnect,
}: {
  eventId: string;
  guest: Guest;
  canConnect: boolean;
}) {
  const t = useTranslations("Events");
  const [state, action, pending] = useActionState(connectAtEvent, idle);
  useRefreshOnSuccess(state);
  const name = guest.firstName ?? "?";

  return (
    <li className="flex items-center gap-3 py-3">
      <Avatar>
        {guest.photoUrl && <AvatarImage src={guest.photoUrl} alt="" />}
        <AvatarFallback>{name[0]}</AvatarFallback>
      </Avatar>
      <div className="mr-auto min-w-0">
        <p className="truncate font-medium">{name}</p>
        {guest.overlap > 0 && (
          <p className="text-xs text-muted-foreground">{t("overlap", { count: guest.overlap })}</p>
        )}
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
      {guest.matched ? (
        <Badge>{t("matched")}</Badge>
      ) : guest.connected ? (
        <Badge variant="secondary">{t("connected")}</Badge>
      ) : canConnect ? (
        <form action={action}>
          <input type="hidden" name="eventId" value={eventId} />
          <input type="hidden" name="toUserId" value={guest.userId} />
          <Button
            type="submit"
            size="sm"
            disabled={pending}
            aria-label={`${t("connect")}: ${name}`}
          >
            {t("connect")}
          </Button>
        </form>
      ) : null}
    </li>
  );
}
