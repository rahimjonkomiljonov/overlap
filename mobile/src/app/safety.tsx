import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Chip, Field, SwitchRow } from '@/components/form';
import { Body, Button, Card, Loading, Notice, Screen, Title, colors } from '@/components/ui';
import type { ApiResult } from '@/lib/api';
import { dayLabel } from '@/lib/meetup';
import {
  fetchSafety,
  hideClub,
  hideCourse,
  hideEmail,
  setIncognito,
  setPaused,
  submitAppeal,
  submitTrustAppeal,
  unblockUser,
  unhideUser,
  type ModerationAction,
  type SafetyScreen,
} from '@/lib/safety';
import { strings } from '@/lib/strings';

type State = { phase: 'loading' } | { phase: 'failed' } | { phase: 'ready'; data: SafetyScreen };

function problemText(result: Extract<ApiResult<unknown>, { ok: false }>): string {
  if (result.code === 'NETWORK') return strings.offlineBody;
  if (result.code === 'RATE_LIMITED') return strings.errorTooManyRequests;
  if (result.code === 'RULE_VIOLATION' && result.reason && strings.safetyErrors[result.reason]) return strings.safetyErrors[result.reason];
  if (result.code === 'NOT_FOUND') return strings.safetyErrors.NOT_FOUND;
  return strings.safetyErrorSave;
}

/** A person in the blocked or hidden list, with the button that undoes it. */
function PersonRow({ name, label, onUndo }: { name: string; label: string; onUndo: () => Promise<ApiResult<unknown>> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function press() {
    setBusy(true);
    setError(null);
    const result = await onUndo();
    setBusy(false);
    if (!result.ok) setError(problemText(result));
  }
  return (
    <View style={{ gap: 4 }}>
      <View style={styles.personRow}>
        <Text style={styles.personName}>{name}</Text>
        <Button label={label} variant="outline" disabled={busy} onPress={() => void press()} />
      </View>
      {error ? <Body tone="bad">{error}</Body> : null}
    </View>
  );
}

function ActionRow({ action, onChanged }: { action: ModerationAction; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    if (!note.trim()) return;
    setBusy(true);
    setError(null);
    const result = await submitAppeal(action.id, note.trim());
    setBusy(false);
    if (result.ok) {
      onChanged();
      return;
    }
    setError(problemText(result));
  }

  return (
    <View style={styles.actionBox}>
      <Text style={styles.personName}>{strings.safetyActionType[action.type] ?? action.type}</Text>
      <Body tone="muted">{dayLabel(action.createdAt)}</Body>
      <Body>{strings.safetyActionReason(action.reason)}</Body>
      {action.appealedAt ? (
        <Body tone="muted">{strings.safetyAppealSubmitted(action.appealNote ?? '')}</Body>
      ) : open ? (
        <View style={{ gap: 8 }}>
          <Field label={strings.safetyAppealPlaceholder} value={note} onChangeText={(t) => setNote(t.slice(0, 1000))} placeholder={strings.safetyAppealPlaceholder} editable={!busy} multiline />
          {error ? <Body tone="bad">{error}</Body> : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button label={strings.reportCancel} variant="outline" disabled={busy} onPress={() => setOpen(false)} />
            <Button label={strings.safetyAppealSubmit} disabled={busy || !note.trim()} onPress={() => void onSubmit()} />
          </View>
        </View>
      ) : (
        <Button label={strings.safetyAppeal} variant="outline" onPress={() => setOpen(true)} />
      )}
    </View>
  );
}

function TrustCard({ data, onChanged }: { data: SafetyScreen; onChanged: () => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { trust } = data;

  async function onSubmit() {
    setBusy(true);
    setError(null);
    const result = await submitTrustAppeal(note.trim());
    setBusy(false);
    if (result.ok) {
      onChanged();
      return;
    }
    setError(problemText(result));
  }

  if (!trust.limited && !trust.lastDecision) return null;
  return (
    <Card>
      {trust.limited ? (
        <>
          <Title>{strings.safetyTrustTitle}</Title>
          <Body tone="muted">{strings.safetyTrustBody}</Body>
          {trust.openAppealSince ? (
            <Body>{strings.safetyTrustAppealPending}</Body>
          ) : (
            <>
              <Field label={strings.safetyAppealPlaceholder} value={note} onChangeText={(t) => setNote(t.slice(0, 1000))} placeholder={strings.safetyAppealPlaceholder} editable={!busy} multiline />
              {error ? <Body tone="bad">{error}</Body> : null}
              <Button label={strings.safetyAppealSubmit} disabled={busy || !note.trim()} onPress={() => void onSubmit()} />
            </>
          )}
        </>
      ) : null}
      {trust.lastDecision ? (
        <>
          <Body>{trust.lastDecision.status === 'ACCEPTED' ? strings.safetyTrustAccepted : strings.safetyTrustRejected}</Body>
          {trust.lastDecision.response ? <Body tone="muted">{strings.safetyTrustResponse(trust.lastDecision.response)}</Body> : null}
        </>
      ) : null}
    </Card>
  );
}

function HideCard({ data, onChanged }: { data: SafetyScreen; onChanged: () => void }) {
  const [courseId, setCourseId] = useState<string | null>(null);
  const [clubId, setClubId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function run(action: () => Promise<ApiResult<{ count: number }>>, done: () => void) {
    setBusy(true);
    setMessage(null);
    const result = await action();
    setBusy(false);
    if (result.ok) {
      setMessage({ ok: true, text: result.data.count === 0 ? strings.safetyHidNobody : strings.safetyHidCount(result.data.count) });
      done();
      onChanged();
      return;
    }
    setMessage({ ok: false, text: problemText(result) });
  }

  return (
    <Card>
      <Title>{strings.safetyHideTitle}</Title>
      {data.courses.length > 0 ? (
        <>
          <Text style={styles.groupLabel}>{strings.safetyHideCourse}</Text>
          <View style={styles.chipRow}>
            {data.courses.map((c) => (
              <Chip key={c.id} label={`${c.code} ${c.title}`} selected={courseId === c.id} onPress={() => setCourseId(c.id)} />
            ))}
          </View>
          <Button label={busy ? strings.safetyHiding : strings.safetyHideButton} variant="outline" disabled={busy || !courseId} onPress={() => void run(() => hideCourse(courseId!), () => setCourseId(null))} />
        </>
      ) : null}
      {data.clubs.length > 0 ? (
        <>
          <Text style={styles.groupLabel}>{strings.safetyHideClub}</Text>
          <View style={styles.chipRow}>
            {data.clubs.map((c) => (
              <Chip key={c.id} label={c.name} selected={clubId === c.id} onPress={() => setClubId(c.id)} />
            ))}
          </View>
          <Button label={busy ? strings.safetyHiding : strings.safetyHideButton} variant="outline" disabled={busy || !clubId} onPress={() => void run(() => hideClub(clubId!), () => setClubId(null))} />
        </>
      ) : null}
      <Text style={styles.groupLabel}>{strings.safetyHideEmail}</Text>
      <Field label={strings.safetyHideEmailPlaceholder} value={email} onChangeText={setEmail} placeholder={strings.safetyHideEmailPlaceholder} autoCapitalize="none" keyboardType="email-address" editable={!busy} />
      <Button label={busy ? strings.safetyHiding : strings.safetyHideButton} variant="outline" disabled={busy || !email.trim()} onPress={() => void run(() => hideEmail(email.trim()), () => setEmail(''))} />
      {message ? <Body tone={message.ok ? 'good' : 'bad'}>{message.text}</Body> : null}
    </Card>
  );
}

/** Safety settings: pause and incognito, hide-from, who you blocked and hid, and what was done to your account and how to appeal. Open to a restricted account. */
export default function SafetyScreenRoute() {
  const router = useRouter();
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [error, setError] = useState<string | null>(null);

  const applyResult = useCallback((result: Awaited<ReturnType<typeof fetchSafety>>) => {
    if (result.ok) setState({ phase: 'ready', data: result.data });
    else setState((current) => (current.phase === 'ready' ? current : { phase: 'failed' }));
  }, []);

  // Fetches directly in the effect (never calling a function that could itself set state
  // synchronously), matching React's rule against synchronous setState from an effect.
  useEffect(() => {
    let active = true;
    fetchSafety().then((result) => {
      if (active) applyResult(result);
    });
    return () => {
      active = false;
    };
  }, [applyResult]);

  const reload = useCallback(() => {
    fetchSafety().then(applyResult);
  }, [applyResult]);

  async function toggle(action: () => Promise<ApiResult<unknown>>) {
    setError(null);
    const result = await action();
    if (!result.ok) setError(problemText(result));
    reload();
  }

  if (state.phase === 'loading') return <Loading label={strings.loading} />;

  if (state.phase === 'failed') {
    return (
      <Screen>
        <Card>
          <Body tone="bad">{strings.safetyErrorLoad}</Body>
          <Button label={strings.tryAgain} onPress={() => { setState({ phase: 'loading' }); reload(); }} />
          <Button label={strings.back} variant="outline" onPress={() => router.back()} />
        </Card>
      </Screen>
    );
  }

  const { data } = state;
  const canToggle = data.status === 'ACTIVE' || data.status === 'PAUSED';

  return (
    <Screen>
      <Title>{strings.safetyTitle}</Title>

      {data.status !== 'ACTIVE' ? (
        <Notice>
          {strings.safetyStatus[data.status]}
          {data.suspendedUntil ? ` ${strings.safetySuspendedUntil(dayLabel(data.suspendedUntil))}` : ''}
        </Notice>
      ) : null}

      <TrustCard data={data} onChanged={reload} />

      <Card>
        <Title>{strings.safetyVisibilityTitle}</Title>
        {canToggle ? (
          <>
            <SwitchRow value={data.paused} onChange={(next) => void toggle(() => setPaused(next))} label={strings.safetyPauseLabel} />
            <Body tone="muted">{strings.safetyPauseHint}</Body>
            <SwitchRow value={data.incognito} onChange={(next) => void toggle(() => setIncognito(next))} label={strings.safetyIncognitoLabel} />
            <Body tone="muted">{strings.safetyIncognitoHint}</Body>
          </>
        ) : (
          <Body tone="muted">{strings.safetyErrors.ACCOUNT_RESTRICTED}</Body>
        )}
        {error ? <Body tone="bad">{error}</Body> : null}
      </Card>

      {data.actions.length > 0 ? (
        <Card>
          <Title>{strings.safetyActionsTitle}</Title>
          {data.actions.map((action) => (
            <ActionRow key={action.id} action={action} onChanged={reload} />
          ))}
        </Card>
      ) : null}

      {canToggle ? <HideCard data={data} onChanged={reload} /> : null}

      <Card>
        <Title>{strings.safetyBlockedTitle}</Title>
        {data.blocked.length === 0 ? <Body tone="muted">{strings.safetyBlockedEmpty}</Body> : null}
        {data.blocked.map((p) => (
          <PersonRow key={p.userId} name={p.name} label={strings.safetyUnblock} onUndo={async () => { const r = await unblockUser(p.userId); if (r.ok) reload(); return r; }} />
        ))}
      </Card>

      <Card>
        <Title>{strings.safetyHiddenTitle}</Title>
        {data.hidden.length === 0 ? <Body tone="muted">{strings.safetyHiddenEmpty}</Body> : null}
        {data.hidden.map((p) => (
          <PersonRow key={p.userId} name={p.name} label={strings.safetyUnhide} onUndo={async () => { const r = await unhideUser(p.userId); if (r.ok) reload(); return r; }} />
        ))}
      </Card>

      <Button label={strings.back} variant="outline" onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  groupLabel: { fontSize: 13, fontWeight: '700', color: colors.muted },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  personRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  personName: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.ink },
  actionBox: { gap: 6, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 },
});
