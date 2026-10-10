"use client";

import { useActionState, useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BlockButton } from "@/components/safety/block-button";
import { MeetupBanner, MeetupStatusDot } from "@/components/meetup/meetup-banner";
import { EmergencyCard } from "@/components/safety/emergency-card";
import { ReportButton } from "@/components/safety/report-button";
import { Link, useRouter } from "@/i18n/navigation";
import { sendMessage, reviveConversation, type ReviveConversationState } from "@/server/chat/actions";
import { MAX_MESSAGE_LENGTH } from "@/server/chat/schema";
import type { ActiveMeetupSummary } from "@/server/meetup/summary";
import type { EmergencyContact } from "@/server/safety/emergency";
import type { SupabaseClient } from "@supabase/supabase-js";

const POLL_INTERVAL_MS = 3_000;
/** Reconciliation-only poll interval when realtime is active — a safety net, not the primary delivery path. */
const RECONCILE_POLL_INTERVAL_MS = 20_000;

export interface ChatMessageView {
  id: string;
  senderId: string;
  text: string;
  createdAt: string;
}

const idleReviveState: ReviveConversationState = { status: "idle" };

/**
 * The open chat thread (BUILD_PLAN S15: polling, not Realtime — 3s in an open chat).
 * Sending uses `useOptimistic` + a manual `useTransition` rather than this codebase's
 * usual `useActionState` form-action pattern: `useOptimistic` only reverts to the real
 * `messages` state once its surrounding transition settles, so the send *and* an
 * immediate refetch both need to happen inside the same transition — otherwise the
 * optimistic bubble would flicker away for up to one poll interval before the real
 * message reappears.
 */
export function ChatThread({
  conversationId,
  matchId,
  actorUserId,
  otherUserId,
  otherFirstName,
  otherPhotoUrl,
  initialMessages,
  realtimeChannel,
  initialStatus,
  matchStatus,
  revivedAt,
  icebreakers,
  emergencyContacts,
  meetup,
}: {
  conversationId: string;
  matchId: string;
  actorUserId: string;
  otherUserId: string;
  otherFirstName: string | null;
  otherPhotoUrl: string | null;
  initialMessages: ChatMessageView[];
  /** Null when Supabase Realtime isn't configured (local dev/CI without Supabase creds) — polling-only, same as before S15's Fast-follow. */
  realtimeChannel: string | null;
  initialStatus: "ACTIVE" | "EXPIRED";
  matchStatus: "ACTIVE" | "UNMATCHED";
  revivedAt: string | null;
  icebreakers: string[];
  emergencyContacts: EmergencyContact[];
  /** A confirmed or waiting meetup with this person, shown at the top. */
  meetup: ActiveMeetupSummary | null;
}) {
  const t = useTranslations("Chat");
  const locale = useLocale();
  const router = useRouter();

  const [messages, setMessages] = useState(initialMessages);
  const [status, setStatus] = useState(initialStatus);
  const [text, setText] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

  const [optimisticMessages, addOptimisticMessage] = useOptimistic(
    messages,
    (state, newText: string) => [
      ...state,
      { id: `optimistic-${Date.now()}`, senderId: actorUserId, text: newText, createdAt: new Date().toISOString() },
    ],
  );

  async function refresh() {
    const res = await fetch(`/api/chat/${conversationId}`);
    if (!res.ok) return;
    const data = await res.json();
    setMessages(data.messages);
    setStatus(data.conversation.status);
  }

  useEffect(() => {
    const id = setInterval(refresh, realtimeChannel ? RECONCILE_POLL_INTERVAL_MS : POLL_INTERVAL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, realtimeChannel]);

  useEffect(() => {
    if (!realtimeChannel) return;
    let active = true;
    let client: SupabaseClient | null = null;

    import("@supabase/supabase-js").then(({ createClient }) => {
      if (!active) return;
      client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
      client
        .channel(realtimeChannel, { config: { broadcast: { self: false } } })
        .on("broadcast", { event: "message" }, ({ payload }) => {
          const incoming = payload as ChatMessageView;
          setMessages((prev) => (prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]));
        })
        .subscribe((status) => {
          // Broadcast has no replay/backlog: a message sent in the gap between page
          // load and the socket actually reaching SUBSCRIBED would otherwise be missed
          // forever, not just delayed. One refresh on connect closes exactly that gap.
          if (status === "SUBSCRIBED" && active) refresh();
        });
    });

    return () => {
      active = false;
      client?.removeAllChannels();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realtimeChannel]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [optimisticMessages.length]);

  const [reviveState, reviveAction] = useActionState(reviveConversation, idleReviveState);
  const [lastReviveState, setLastReviveState] = useState(reviveState);
  if (reviveState !== lastReviveState) {
    setLastReviveState(reviveState);
    if (reviveState.status === "success") setStatus("ACTIVE");
  }

  const canInteract = matchStatus === "ACTIVE" && status === "ACTIVE";

  function handleSubmit(formData: FormData) {
    const value = (formData.get("text") as string | null)?.trim();
    if (!value) return;
    startTransition(async () => {
      addOptimisticMessage(value);
      const result = await sendMessage({ status: "idle" }, formData);
      if (result.status === "error") {
        setSendError(result.code);
        return;
      }
      setSendError(null);
      setText("");
      await refresh();
    });
  }

  const timeFormatter = new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ko-KR", { timeStyle: "short" });

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col md:h-[calc(100vh-2rem)]">
      <div className="flex items-center gap-3 border-b border-border pb-4">
        <Link href="/matches" aria-label={t("backToMatches")} className="text-muted-foreground hover:text-foreground">
          &larr;
        </Link>
        <Link
          href={`/profile/${otherUserId}`}
          aria-label={t("openProfile", { name: otherFirstName ?? "" })}
          className="mr-auto flex min-w-0 items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Avatar size="default">
            {otherPhotoUrl && <AvatarImage src={otherPhotoUrl} alt="" />}
            <AvatarFallback>{otherFirstName?.[0] ?? "?"}</AvatarFallback>
          </Avatar>
          <p className="truncate font-medium">{otherFirstName}</p>
        </Link>
        <ReportButton targetUserId={otherUserId} conversationId={conversationId} />
        <BlockButton targetUserId={otherUserId} onBlocked={() => router.push("/matches")} />
      </div>

      {meetup && <MeetupBanner meetup={meetup} matchId={matchId} actorUserId={actorUserId} />}

      <div className="flex items-center gap-2 border-b border-border py-2">
        <Link
          href={`/meetup/${matchId}`}
          className="relative text-sm font-medium text-primary underline"
        >
          {meetup ? t("viewMeetup") : t("planMeetup")}
          {meetup && <MeetupStatusDot status={meetup.status} unseen={meetup.unseen} className="-right-3" />}
        </Link>
        <div className="ml-auto">
          <EmergencyCard contacts={emergencyContacts} />
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto py-4">
        {optimisticMessages.length === 0 && (
          <div className="space-y-2 rounded-lg border border-border p-4">
            <p className="text-sm font-medium">{t("icebreakersHeading")}</p>
            <div className="flex flex-col gap-2">
              {icebreakers.map((suggestion, i) => (
                <Button
                  key={i}
                  type="button"
                  variant="outline"
                  className="h-auto justify-start text-left whitespace-normal"
                  onClick={() => setText(suggestion)}
                >
                  {suggestion}
                </Button>
              ))}
            </div>
          </div>
        )}

        {optimisticMessages.map((message) => {
          const mine = message.senderId === actorUserId;
          return (
            <div key={message.id} className={mine ? "flex justify-end" : "flex justify-start"}>
              <div
                className={
                  mine
                    ? "max-w-[80%] rounded-2xl bg-primary px-4 py-2 text-primary-foreground"
                    : "max-w-[80%] rounded-2xl bg-muted px-4 py-2"
                }
              >
                <p className="text-sm whitespace-pre-wrap">{message.text}</p>
                <p className={mine ? "mt-1 text-right text-xs text-primary-foreground" : "mt-1 text-right text-xs text-muted-foreground"}>
                  {timeFormatter.format(new Date(message.createdAt))}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {sendError && (
        <p role="alert" className="pb-2 text-sm text-destructive">
          {t(`errors.${sendError}` as never)}
        </p>
      )}

      {!canInteract && matchStatus === "UNMATCHED" && (
        <Badge variant="outline" className="mb-2 self-start">
          {t("unmatchedNotice")}
        </Badge>
      )}

      {matchStatus === "ACTIVE" && status === "EXPIRED" && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
          <p className="text-sm text-muted-foreground">{revivedAt ? t("expiredPermanently") : t("expiredNotice")}</p>
          {!revivedAt && (
            <form action={reviveAction}>
              <input type="hidden" name="conversationId" value={conversationId} />
              <Button type="submit">{t("revive")}</Button>
            </form>
          )}
        </div>
      )}

      {canInteract && (
        <form
          action={handleSubmit}
          className="flex items-center gap-2 border-t border-border pt-3"
        >
          <input type="hidden" name="conversationId" value={conversationId} />
          <Input
            name="text"
            autoComplete="off"
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
            placeholder={t("composerPlaceholder")}
            aria-label={t("composerPlaceholder")}
            disabled={isPending}
          />
          <Button type="submit" disabled={isPending || text.trim().length === 0}>
            {t("send")}
          </Button>
        </form>
      )}
    </div>
  );
}
