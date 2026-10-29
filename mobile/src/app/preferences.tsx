import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Chip } from '@/components/form';
import { Body, Button, Card, Loading, Screen, Title } from '@/components/ui';
import type { ApiResult } from '@/lib/api';
import { fetchMatchingPreferences, saveMatchingPreferences, sliderSteps, type MatchingPreferences } from '@/lib/privacy';
import { strings } from '@/lib/strings';
import { useStyles, type Palette } from '@/lib/theme';

type State = { phase: 'loading' } | { phase: 'failed' } | { phase: 'ready'; prefs: MatchingPreferences };
type Values = { classes: number; interests: number; freeTime: number };

function problemText(result: Extract<ApiResult<unknown>, { ok: false }>): string {
  if (result.code === 'NETWORK') return strings.offlineBody;
  if (result.code === 'RATE_LIMITED') return strings.errorTooManyRequests;
  return strings.prefsErrorSave;
}

function Row({ label, value, steps, onChange }: { label: string; value: number; steps: number[]; onChange: (v: number) => void }) {
  const styles = useStyles(makeStyles);
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chipRow}>
        {steps.map((step) => (
          <Chip key={step} label={strings.prefsLevels[String(step)] ?? String(step)} selected={value === step} onPress={() => onChange(step)} />
        ))}
      </View>
    </View>
  );
}

function Form({ prefs }: { prefs: MatchingPreferences }) {
  const [values, setValues] = useState<Values>({ classes: prefs.classes, interests: prefs.interests, freeTime: prefs.freeTime });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const steps = sliderSteps(prefs);

  async function onSave() {
    setBusy(true);
    setMessage(null);
    const result = await saveMatchingPreferences(values);
    setBusy(false);
    setMessage(result.ok ? { ok: true, text: strings.prefsSaved } : { ok: false, text: problemText(result) });
  }

  return (
    <Card>
      <Row label={strings.prefsClasses} value={values.classes} steps={steps} onChange={(v) => setValues((c) => ({ ...c, classes: v }))} />
      <Row label={strings.prefsInterests} value={values.interests} steps={steps} onChange={(v) => setValues((c) => ({ ...c, interests: v }))} />
      <Row label={strings.prefsFreeTime} value={values.freeTime} steps={steps} onChange={(v) => setValues((c) => ({ ...c, freeTime: v }))} />
      {message ? <Body tone={message.ok ? 'good' : 'bad'}>{message.text}</Body> : null}
      <Button label={busy ? strings.prefsSaving : strings.prefsSave} disabled={busy} onPress={() => void onSave()} />
    </Card>
  );
}

/** "What matters to you": how much to weigh shared classes, interests and free time when picking people. It changes the order of picks, never who is shown. */
export default function PreferencesScreen() {
  const router = useRouter();
  const [state, setState] = useState<State>({ phase: 'loading' });

  const applyResult = useCallback((result: Awaited<ReturnType<typeof fetchMatchingPreferences>>) => {
    if (result.ok) setState({ phase: 'ready', prefs: result.data });
    else setState((current) => (current.phase === 'ready' ? current : { phase: 'failed' }));
  }, []);

  // Fetches directly in the effect (never calling a function that could itself set state
  // synchronously), matching React's rule against synchronous setState from an effect.
  useEffect(() => {
    let active = true;
    fetchMatchingPreferences().then((result) => {
      if (active) applyResult(result);
    });
    return () => {
      active = false;
    };
  }, [applyResult]);

  if (state.phase === 'loading') return <Loading label={strings.loading} />;

  if (state.phase === 'failed') {
    return (
      <Screen>
        <Card>
          <Body tone="bad">{strings.prefsErrorLoad}</Body>
          <Button label={strings.tryAgain} onPress={() => { setState({ phase: 'loading' }); fetchMatchingPreferences().then(applyResult); }} />
          <Button label={strings.back} variant="outline" onPress={() => router.back()} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ gap: 4 }}>
        <Title>{strings.prefsTitle}</Title>
        <Body tone="muted">{strings.prefsIntro}</Body>
      </View>
      <Form prefs={state.prefs} />
      <Button label={strings.back} variant="outline" onPress={() => router.back()} />
    </Screen>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  label: { fontSize: 14, fontWeight: '700', color: colors.ink },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
