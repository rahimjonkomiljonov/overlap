import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CheckRow, Field, SwitchRow } from '@/components/form';
import { Body, Button, Card, Loading, Screen, Title } from '@/components/ui';
import { apiGet, apiPost } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { API_URL } from '@/lib/config';
import { useMe } from '@/lib/me';
import { strings } from '@/lib/strings';
import { useStyles, type Palette } from '@/lib/theme';

type Step = 'age' | 'terms' | 'sensitive' | 'invite';
type Info = { accountSetupComplete: boolean; inviteCodeRequired: boolean; minimumAge: number };

/** What each reason the server can give for a refused setup means to a person, and which step to send them back to. */
const reasons = (): Record<string, { message: string; step: Step }> => ({
  TOO_YOUNG: { message: strings.errorTooYoung, step: 'age' },
  INVALID_DATE: { message: strings.errorInvalidDate, step: 'age' },
  IMPLAUSIBLE_YEAR: { message: strings.errorImplausibleYear, step: 'age' },
  NOT_ATTESTED: { message: strings.errorCheckInput, step: 'age' },
  INVALID_INVITE: { message: strings.errorInvalidInvite, step: 'invite' },
});

const digitsOnly = (text: string) => text.replace(/\D/g, '');

/**
 * Finishing account setup, one question at a time: age, Terms, the optional Dating-mode consent and,
 * while cohort release is on, the invite code. Nothing is pre-ticked. The Dating-mode answer is a
 * separate choice and "no" is a normal answer: the account is still created.
 */
export default function OnboardingScreen() {
  const styles = useStyles(makeStyles);
  const { refresh } = useMe();
  const [info, setInfo] = useState<Info | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [attestedAdult, setAttestedAdult] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [sensitive, setSensitive] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiGet<Info>('/onboarding').then((result) => {
      if (!active) return;
      // If it cannot be read, assume no invite code is needed: the server still enforces it.
      setInfo(result.ok ? result.data : { accountSetupComplete: false, inviteCodeRequired: false, minimumAge: 19 });
    });
    return () => {
      active = false;
    };
  }, []);

  if (!info) return <Loading label={strings.loading} />;

  const steps: Step[] = ['age', 'terms', 'sensitive', ...(info.inviteCodeRequired ? (['invite'] as const) : [])];
  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;

  const canContinue =
    step === 'age'
      ? year.length === 4 && month.length >= 1 && day.length >= 1 && attestedAdult
      : step === 'terms'
        ? termsAccepted
        : step === 'invite'
          ? inviteCode.trim().length > 0
          : true; // the Dating-mode step is optional

  async function submit() {
    setBusy(true);
    setError(null);
    const result = await apiPost<{ status: string }>('/onboarding/account', {
      birthYear: Number(year),
      birthMonth: Number(month),
      birthDay: Number(day),
      attestedAdult,
      termsAccepted,
      sensitivePreference: sensitive,
      ...(info?.inviteCodeRequired ? { inviteCode: inviteCode.trim() } : {}),
    });
    setBusy(false);
    // On success the layout notices the account is set up and shows the home screen.
    if (result.ok) return refresh();
    const known = result.code === 'RULE_VIOLATION' && result.reason ? reasons()[result.reason] : undefined;
    if (known) {
      setError(known.message);
      setStepIndex(steps.indexOf(known.step));
    } else if (result.code === 'INVALID_INPUT') {
      setError(strings.errorCheckInput);
    } else {
      setError(strings.errorSetupFailed);
    }
  }

  return (
    <Screen>
      <Card>
        <Body tone="muted">{strings.setupStep(stepIndex + 1, steps.length)}</Body>
        {step === 'age' ? (
          <>
            <Title>{strings.ageTitle}</Title>
            <Body tone="muted">{strings.ageBody}</Body>
            <View style={styles.dateRow}>
              <Field label={strings.birthYear} value={year} onChangeText={(t) => setYear(digitsOnly(t))} keyboardType="number-pad" maxLength={4} placeholder="2000" />
              <Field label={strings.birthMonth} value={month} onChangeText={(t) => setMonth(digitsOnly(t))} keyboardType="number-pad" maxLength={2} placeholder="5" />
              <Field label={strings.birthDay} value={day} onChangeText={(t) => setDay(digitsOnly(t))} keyboardType="number-pad" maxLength={2} placeholder="17" />
            </View>
            <Body tone="muted">{strings.birthDateNote}</Body>
            <CheckRow checked={attestedAdult} onChange={setAttestedAdult} label={strings.attestedAdult} />
          </>
        ) : null}

        {step === 'terms' ? (
          <>
            <Title>{strings.termsTitle}</Title>
            <Body tone="muted">{strings.termsBody}</Body>
            <Button label={strings.readTerms} variant="outline" onPress={() => void WebBrowser.openBrowserAsync(`${API_URL}/terms`)} />
            <Button label={strings.readPrivacy} variant="outline" onPress={() => void WebBrowser.openBrowserAsync(`${API_URL}/privacy`)} />
            <CheckRow checked={termsAccepted} onChange={setTermsAccepted} label={strings.termsAgree} />
          </>
        ) : null}

        {step === 'sensitive' ? (
          <>
            <Title>{strings.sensitiveTitle}</Title>
            <Body tone="muted">{strings.sensitiveBody}</Body>
            <SwitchRow value={sensitive} onChange={setSensitive} label={strings.sensitiveAgree} />
          </>
        ) : null}

        {step === 'invite' ? (
          <>
            <Title>{strings.inviteTitle}</Title>
            <Body tone="muted">{strings.inviteBody}</Body>
            <Field label={strings.inviteLabel} value={inviteCode} onChangeText={setInviteCode} autoCapitalize="characters" autoCorrect={false} maxLength={32} />
          </>
        ) : null}

        {error ? <Body tone="bad">{error}</Body> : null}

        <Button
          label={isLast ? (busy ? strings.saving : strings.finish) : strings.next}
          disabled={!canContinue || busy}
          onPress={() => {
            setError(null);
            if (isLast) void submit();
            else setStepIndex(stepIndex + 1);
          }}
        />
        {stepIndex > 0 ? <Button label={strings.back} variant="link" disabled={busy} onPress={() => setStepIndex(stepIndex - 1)} /> : null}
        {/* Signed in with the wrong email? There has to be a way out of setup. */}
        <Button label={strings.signOut} variant="link" disabled={busy} onPress={() => void authClient.signOut()} />
      </Card>
    </Screen>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  dateRow: { flexDirection: 'row', gap: 10 },
});
