import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Share, StyleSheet, Text, View } from 'react-native';

import { PushCard } from '@/components/push-card';
import { Body, Button, Card, Loading, Screen, Title } from '@/components/ui';
import type { ApiResult } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { dayLabel } from '@/lib/meetup';
import { deleteAccount, fetchExport, fetchPrivacy, withdrawConsent, type ConsentEntry, type PrivacyOverview } from '@/lib/privacy';
import { strings } from '@/lib/strings';
import { useStyles, type Palette } from '@/lib/theme';

type State = { phase: 'loading' } | { phase: 'failed' } | { phase: 'ready'; data: PrivacyOverview };

function problemText(result: Extract<ApiResult<unknown>, { ok: false }>): string {
  if (result.code === 'NETWORK') return strings.offlineBody;
  if (result.code === 'RATE_LIMITED') return strings.errorTooManyRequests;
  if (result.code === 'RULE_VIOLATION' && result.reason && strings.privacyErrors[result.reason]) return strings.privacyErrors[result.reason];
  if (result.code === 'NOT_FOUND') return strings.privacyErrors.NOT_FOUND;
  return strings.privacyErrorSave;
}

function ConsentRow({ entry, onChanged }: { entry: ConsentEntry; onChanged: () => void }) {
  const styles = useStyles(makeStyles);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onWithdraw() {
    setBusy(true);
    setError(null);
    const result = await withdrawConsent(entry.type);
    setBusy(false);
    if (result.ok) {
      onChanged();
      return;
    }
    setError(problemText(result));
    onChanged();
  }

  return (
    <View style={styles.consentRow}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.consentName}>{strings.privacyConsentTypes[entry.type] ?? entry.type}</Text>
        <Body tone="muted">
          {entry.active ? strings.privacyConsentActive : strings.privacyConsentWithdrawn}
          {!entry.withdrawable ? ` · ${strings.privacyConsentRequired}` : ''}
        </Body>
        {entry.withdrawable && entry.active && entry.type === 'SENSITIVE_PREFERENCE' ? <Body tone="muted">{strings.privacyWithdrawSensitiveWarning}</Body> : null}
        {error ? <Body tone="bad">{error}</Body> : null}
      </View>
      {entry.withdrawable && entry.active ? <Button label={busy ? strings.privacyWithdrawing : strings.privacyWithdraw} variant="outline" disabled={busy} onPress={() => void onWithdraw()} /> : null}
    </View>
  );
}

function DataCard({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [exported, setExported] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  async function onDownload() {
    setBusy(true);
    setError(null);
    const result = await fetchExport();
    setBusy(false);
    if (result.ok) {
      setExported(result.data.data);
      onDone();
      return;
    }
    setError(problemText(result));
  }

  return (
    <Card>
      <Title>{strings.privacyDataTitle}</Title>
      <Body tone="muted">{strings.privacyDataHint}</Body>
      {exported ? (
        <>
          <Body tone="good">{strings.privacyDataReady}</Body>
          <Button label={strings.privacyDataSend} onPress={() => void Share.share({ title: strings.privacyDataFileName, message: JSON.stringify(exported, null, 2) })} />
        </>
      ) : (
        <Button label={busy ? strings.privacyDataPreparing : strings.privacyDataButton} variant="outline" disabled={busy} onPress={() => void onDownload()} />
      )}
      {error ? <Body tone="bad">{error}</Body> : null}
    </Card>
  );
}

function DeleteCard() {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    setBusy(true);
    setError(null);
    const result = await deleteAccount();
    if (result.ok) {
      // The server has already closed the account and ended every session; this tells the person and clears the phone.
      Alert.alert(strings.privacyDeleteDoneTitle, strings.privacyDeleteDoneBody(dayLabel(result.data.purgeAfter)), [{ text: 'OK', onPress: () => void authClient.signOut() }], {
        cancelable: false,
      });
      return;
    }
    setBusy(false);
    setError(problemText(result));
  }

  return (
    <Card>
      <Title>{strings.privacyDeleteTitle}</Title>
      <Body tone="muted">{strings.privacyDeleteHint}</Body>
      {confirming ? (
        <View style={{ gap: 8 }}>
          <Body tone="bad">{strings.privacyDeleteConfirm}</Body>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button label={strings.reportCancel} variant="outline" disabled={busy} onPress={() => setConfirming(false)} />
            <Button label={busy ? strings.privacyDeleting : strings.privacyDeleteConfirmButton} disabled={busy} onPress={() => void onDelete()} />
          </View>
        </View>
      ) : (
        <Button label={strings.privacyDeleteButton} variant="outline" onPress={() => setConfirming(true)} />
      )}
      {error ? <Body tone="bad">{error}</Body> : null}
    </Card>
  );
}

/** Privacy and account: download my data, the consents I can withdraw, what notifications I get, my request history, and deleting my account. */
export default function PrivacyScreen() {
  const styles = useStyles(makeStyles);
  const router = useRouter();
  const [state, setState] = useState<State>({ phase: 'loading' });

  const applyResult = useCallback((result: Awaited<ReturnType<typeof fetchPrivacy>>) => {
    if (result.ok) setState({ phase: 'ready', data: result.data });
    else setState((current) => (current.phase === 'ready' ? current : { phase: 'failed' }));
  }, []);

  // Fetches directly in the effect (never calling a function that could itself set state
  // synchronously), matching React's rule against synchronous setState from an effect.
  useEffect(() => {
    let active = true;
    fetchPrivacy().then((result) => {
      if (active) applyResult(result);
    });
    return () => {
      active = false;
    };
  }, [applyResult]);

  const reload = useCallback(() => {
    fetchPrivacy().then(applyResult);
  }, [applyResult]);

  if (state.phase === 'loading') return <Loading label={strings.loading} />;

  if (state.phase === 'failed') {
    return (
      <Screen>
        <Card>
          <Body tone="bad">{strings.privacyErrorLoad}</Body>
          <Button label={strings.tryAgain} onPress={() => { setState({ phase: 'loading' }); reload(); }} />
          <Button label={strings.back} variant="outline" onPress={() => router.back()} />
        </Card>
      </Screen>
    );
  }

  const { data } = state;

  return (
    <Screen>
      <Title>{strings.privacyTitle}</Title>

      <DataCard onDone={reload} />

      <Card>
        <Title>{strings.privacyConsentsTitle}</Title>
        {data.consents.map((entry) => (
          <ConsentRow key={entry.type} entry={entry} onChanged={reload} />
        ))}
      </Card>

      <PushCard />

      <Card>
        <Title>{strings.privacyRequestsTitle}</Title>
        {data.dataRequests.length === 0 ? <Body tone="muted">{strings.privacyRequestsEmpty}</Body> : null}
        {data.dataRequests.map((r) => (
          <View key={r.id} style={styles.requestRow}>
            <Text style={styles.consentName}>{strings.privacyRequestTypes[r.type] ?? r.type}</Text>
            <Body tone="muted">{`${dayLabel(r.createdAt)} · ${strings.privacyRequestStatus[r.status] ?? r.status}`}</Body>
          </View>
        ))}
      </Card>

      <DeleteCard />

      <Button label={strings.back} variant="outline" onPress={() => router.back()} />
    </Screen>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  consentRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  consentName: { fontSize: 16, fontWeight: '700', color: colors.ink },
  requestRow: { gap: 2, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 },
});
