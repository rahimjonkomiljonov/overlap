"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { unblockUser, type BlockActionState } from "@/server/safety/block-actions";
import { hideByClub, hideByCourse, hideByEmail, unhide, type HideActionState } from "@/server/safety/hide-actions";
import { setIncognito, setPaused, type SafetyToggleState } from "@/server/safety/pause-actions";
import { submitAppeal, type SubmitAppealState } from "@/server/reports/actions";
import type { MyModerationAction } from "@/server/reports/queries";
import type { MySafetySettings } from "@/server/safety/queries";

const idleHide: HideActionState = { status: "idle" };
const idleBlock: BlockActionState = { status: "idle" };
const idleToggle: SafetyToggleState = { status: "idle" };
const idleAppeal: SubmitAppealState = { status: "idle" };

/** G3/I3: pause/incognito, hide-from (course/club/email), the blocked list and appeals — all in one client component so each control can own its own action state, per this codebase's usual per-row pattern. */
export function SafetySettings({
  settings,
  courses,
  clubs,
  moderationActions,
}: {
  settings: MySafetySettings;
  courses: { id: string; code: string; title: string }[];
  clubs: { id: string; name: string }[];
  moderationActions: MyModerationAction[];
}) {
  const t = useTranslations("SafetySettings");

  return (
    <div className="space-y-4">
      <PauseIncognitoCard paused={settings.paused} incognito={settings.incognito} />
      <HideFromCard courses={courses} clubs={clubs} />
      <ListCard title={t("blockedTitle")} empty={t("blockedEmpty")} entries={settings.blocked}>
        {(entry) => <UnblockRow key={entry.userId} userId={entry.userId} name={entry.name} />}
      </ListCard>
      <ListCard title={t("hiddenTitle")} empty={t("hiddenEmpty")} entries={settings.hidden}>
        {(entry) => <UnhideRow key={entry.userId} userId={entry.userId} name={entry.name} />}
      </ListCard>
      {moderationActions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("actionsTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {moderationActions.map((action) => (
              <ActionRow key={action.id} action={action} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PauseIncognitoCard({ paused, incognito }: { paused: boolean; incognito: boolean }) {
  const t = useTranslations("SafetySettings");
  const router = useRouter();
  const [pauseState, pauseAction] = useActionState(setPaused, idleToggle);
  const [incognitoState, incognitoAction] = useActionState(setIncognito, idleToggle);

  const [lastPause, setLastPause] = useState(pauseState);
  if (pauseState !== lastPause) {
    setLastPause(pauseState);
    if (pauseState.status === "success") router.refresh();
  }
  const [lastIncognito, setLastIncognito] = useState(incognitoState);
  if (incognitoState !== lastIncognito) {
    setLastIncognito(incognitoState);
    if (incognitoState.status === "success") router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("visibilityTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">{t("pauseLabel")}</p>
            <p className="text-sm text-muted-foreground">{t("pauseHint")}</p>
          </div>
          <form action={pauseAction}>
            <input type="hidden" name="paused" value={paused ? "false" : "true"} />
            <Button type="submit" variant={paused ? "default" : "outline"}>
              {t(paused ? "unpause" : "pause")}
            </Button>
          </form>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">{t("incognitoLabel")}</p>
            <p className="text-sm text-muted-foreground">{t("incognitoHint")}</p>
          </div>
          <form action={incognitoAction}>
            <input type="hidden" name="incognito" value={incognito ? "false" : "true"} />
            <Button type="submit" variant={incognito ? "default" : "outline"}>
              {t(incognito ? "incognitoOn" : "incognitoOff")}
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}

function HideFromCard({
  courses,
  clubs,
}: {
  courses: { id: string; code: string; title: string }[];
  clubs: { id: string; name: string }[];
}) {
  const t = useTranslations("SafetySettings");
  const router = useRouter();
  const [courseState, courseAction] = useActionState(hideByCourse, idleHide);
  const [clubState, clubAction] = useActionState(hideByClub, idleHide);
  const [emailState, emailAction] = useActionState(hideByEmail, idleHide);

  const [lastCourse, setLastCourse] = useState(courseState);
  if (courseState !== lastCourse) {
    setLastCourse(courseState);
    if (courseState.status === "success") router.refresh();
  }
  const [lastClub, setLastClub] = useState(clubState);
  if (clubState !== lastClub) {
    setLastClub(clubState);
    if (clubState.status === "success") router.refresh();
  }
  const [lastEmail, setLastEmail] = useState(emailState);
  if (emailState !== lastEmail) {
    setLastEmail(emailState);
    if (emailState.status === "success") router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("hideFromTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {courses.length > 0 && (
          <form action={courseAction} className="flex items-center gap-2">
            <select
              name="courseId"
              required
              defaultValue=""
              className="h-11 flex-1 rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="" disabled>
                {t("chooseCourse")}
              </option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} · {c.title}
                </option>
              ))}
            </select>
            <Button type="submit" variant="outline">
              {t("hide")}
            </Button>
          </form>
        )}
        {clubs.length > 0 && (
          <form action={clubAction} className="flex items-center gap-2">
            <select
              name="clubId"
              required
              defaultValue=""
              className="h-11 flex-1 rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="" disabled>
                {t("chooseClub")}
              </option>
              {clubs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <Button type="submit" variant="outline">
              {t("hide")}
            </Button>
          </form>
        )}
        <form action={emailAction} className="flex items-center gap-2">
          <Input name="email" type="email" placeholder={t("emailPlaceholder")} aria-label={t("emailPlaceholder")} required />
          <Button type="submit" variant="outline">
            {t("hide")}
          </Button>
        </form>
        {(courseState.status === "error" || clubState.status === "error" || emailState.status === "error") && (
          <p role="alert" className="text-sm text-destructive">
            {t(
              `errors.${
                courseState.status === "error"
                  ? courseState.code
                  : clubState.status === "error"
                    ? clubState.code
                    : (emailState as { status: "error"; code: string }).code
              }` as never,
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ListCard({
  title,
  empty,
  entries,
  children,
}: {
  title: string;
  empty: string;
  entries: { userId: string; name: string }[];
  children: (entry: { userId: string; name: string }) => React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          entries.map((entry) => children(entry))
        )}
      </CardContent>
    </Card>
  );
}

function UnblockRow({ userId, name }: { userId: string; name: string }) {
  const t = useTranslations("SafetySettings");
  const router = useRouter();
  const [state, action] = useActionState(unblockUser, idleBlock);
  const [last, setLast] = useState(state);
  if (state !== last) {
    setLast(state);
    if (state.status === "success") router.refresh();
  }
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm">{name}</p>
      <form action={action}>
        <input type="hidden" name="targetUserId" value={userId} />
        <Button type="submit" variant="outline" size="sm">
          {t("unblock")}
        </Button>
      </form>
    </div>
  );
}

function UnhideRow({ userId, name }: { userId: string; name: string }) {
  const t = useTranslations("SafetySettings");
  const router = useRouter();
  const [state, action] = useActionState(unhide, idleHide);
  const [last, setLast] = useState(state);
  if (state !== last) {
    setLast(state);
    if (state.status === "success") router.refresh();
  }
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm">{name}</p>
      <form action={action}>
        <input type="hidden" name="hiddenUserId" value={userId} />
        <Button type="submit" variant="outline" size="sm">
          {t("unhide")}
        </Button>
      </form>
    </div>
  );
}

function ActionRow({ action }: { action: MyModerationAction }) {
  const t = useTranslations("SafetySettings");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(submitAppeal, idleAppeal);
  const [last, setLast] = useState(state);
  if (state !== last) {
    setLast(state);
    if (state.status === "success") router.refresh();
  }

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <Badge variant="secondary">{t(`actionType.${action.type}` as never)}</Badge>
        <p className="text-xs text-muted-foreground">
          {new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(action.createdAt)}
        </p>
      </div>
      <p className="text-sm">{action.reason}</p>
      {action.appealNote ? (
        <p className="text-sm text-muted-foreground">{t("appealSubmitted", { note: action.appealNote })}</p>
      ) : open ? (
        <form action={formAction} className="space-y-2">
          <input type="hidden" name="moderationActionId" value={action.id} />
          <Textarea name="appealNote" placeholder={t("appealPlaceholder")} aria-label={t("appealPlaceholder")} required />
          {state.status === "error" && (
            <p role="alert" className="text-sm text-destructive">
              {t(`errors.${state.code}` as never)}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit">{t("appealSubmit")}</Button>
          </div>
        </form>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          {t("appeal")}
        </Button>
      )}
    </div>
  );
}
