import { randomUUID } from 'expo-crypto';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { Field } from '@/components/form';
import { Body, Button, Card, Loading, Screen, Title, colors } from '@/components/ui';
import { imageSource, type ApiResult } from '@/lib/api';
import { successFeedback } from '@/lib/haptics';
import { useCookie } from '@/lib/use-cookie';
import { declineWave, fetchWaves, waveBack, type IncomingWave } from '@/lib/waves';
import { strings } from '@/lib/strings';

type State = { phase: 'loading' } | { phase: 'failed'; text: string } | { phase: 'ready'; waves: IncomingWave[] };

function wavesProblemText(result: Extract<ApiResult<unknown>, { ok: false }>): string {
  if (result.code === 'NETWORK') return strings.offlineBody;
  if (result.code === 'RATE_LIMITED') return strings.errorTooManyRequests;
  return strings.errorWavesLoad;
}

function targetLabel(target: IncomingWave['targetElement']): string {
  if (target.type === 'photo') return strings.wavesTargetPhoto;
  if (target.type === 'promptAnswer') return strings.wavesTargetPrompt;
  return strings.wavesTargetProfile;
}

function WaveAvatar({ url, label }: { url: string | null; label: string }) {
  const cookie = useCookie();
  if (!url || !cookie) {
    return (
      <View style={[styles.photo, styles.photoFallback]}>
        <Text style={styles.photoInitial}>{label[0] ?? '?'}</Text>
      </View>
    );
  }
  return <Image source={imageSource(url, cookie)} style={styles.photo} accessibilityLabel={label} contentFit="cover" />;
}

function WaveInboxRow({ wave, onDecided }: { wave: IncomingWave; onDecided: (id: string) => void }) {
  const [composerOpen, setComposerOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef(randomUUID());

  async function onWaveBack() {
    setBusy(true);
    setError(null);
    const result = await waveBack(wave.id, key.current, note.trim() || undefined);
    setBusy(false);
    if (result.ok) {
      successFeedback();
      Alert.alert(strings.waveMatchedNow);
      onDecided(wave.id);
      return;
    }
    setError(wavesProblemText(result));
  }

  async function onDecline() {
    setBusy(true);
    setError(null);
    const result = await declineWave(wave.id);
    setBusy(false);
    if (result.ok) {
      onDecided(wave.id);
      return;
    }
    setError(wavesProblemText(result));
  }

  const name = wave.firstName ?? '?';
  return (
    <Card>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <WaveAvatar url={wave.photoUrl} label={name} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.name}>{name}</Text>
          <Body tone="muted">{targetLabel(wave.targetElement)}</Body>
          {wave.note ? <Body>{`"${wave.note}"`}</Body> : null}
        </View>
      </View>

      {error ? <Body tone="bad">{error}</Body> : null}

      {composerOpen ? (
        <View style={{ gap: 8 }}>
          <Field
            label={strings.waveNotePlaceholder}
            value={note}
            onChangeText={(t) => setNote(t.slice(0, 140))}
            placeholder={strings.waveNotePlaceholder}
            maxLength={140}
            editable={!busy}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button label={strings.wavesCancel} variant="outline" disabled={busy} onPress={() => setComposerOpen(false)} />
            <Button label={busy ? strings.waving : strings.wavesSend} disabled={busy} onPress={() => void onWaveBack()} />
          </View>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button label={strings.wavesDecline} variant="outline" disabled={busy} onPress={() => void onDecline()} />
          <Button label={strings.wavesWaveBack} disabled={busy} onPress={() => setComposerOpen(true)} />
        </View>
      )}
    </Card>
  );
}

/** "Waved at you": everyone currently waiting on an answer from the caller, most recent first. */
export default function WavesScreen() {
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [refreshing, setRefreshing] = useState(false);

  const applyResult = useCallback((result: Awaited<ReturnType<typeof fetchWaves>>) => {
    if (result.ok) setState({ phase: 'ready', waves: result.data.waves });
    else setState({ phase: 'failed', text: wavesProblemText(result) });
    setRefreshing(false);
  }, []);

  // Fetches directly in the effect (never calling a function that could itself set state
  // synchronously), matching React's rule against synchronous setState from an effect.
  useEffect(() => {
    let active = true;
    fetchWaves().then((result) => {
      if (active) applyResult(result);
    });
    return () => {
      active = false;
    };
  }, [applyResult]);

  const reload = useCallback(
    (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      fetchWaves().then(applyResult);
    },
    [applyResult],
  );

  function removeLocally(id: string) {
    setState((current) => (current.phase === 'ready' ? { phase: 'ready', waves: current.waves.filter((w) => w.id !== id) } : current));
  }

  if (state.phase === 'loading') return <Loading label={strings.loading} />;

  return (
    <Screen onRefresh={() => reload(true)} refreshing={refreshing}>
      <Title>{strings.wavesTitle}</Title>

      {state.phase === 'failed' ? (
        <Card>
          <Body tone="bad">{state.text}</Body>
          <Button label={strings.tryAgain} onPress={() => reload()} />
        </Card>
      ) : null}

      {state.phase === 'ready' && state.waves.length === 0 ? (
        <Card>
          <Title>{strings.wavesEmptyTitle}</Title>
          <Body tone="muted">{strings.wavesEmptyBody}</Body>
        </Card>
      ) : null}

      {state.phase === 'ready' ? state.waves.map((wave) => <WaveInboxRow key={wave.id} wave={wave} onDecided={removeLocally} />) : null}

    </Screen>
  );
}

const styles = StyleSheet.create({
  name: { fontSize: 16, fontWeight: '700', color: colors.ink },
  photo: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.border },
  photoFallback: { alignItems: 'center', justifyContent: 'center' },
  photoInitial: { fontSize: 18, fontWeight: '800', color: colors.muted },
});
