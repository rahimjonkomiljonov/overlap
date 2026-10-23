import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { Body, Button, Card, colors, Screen, Title } from '@/components/ui';
import { authClient } from '@/lib/auth-client';
import { strings } from '@/lib/strings';

/** Sign in with a school email and a 6-digit code, the same flow as the website. */
export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    setBusy(true);
    setError(null);
    const { error: failure } = await authClient.emailOtp.sendVerificationOtp({ email: email.trim().toLowerCase(), type: 'sign-in' });
    setBusy(false);
    if (!failure) return setStep('code');
    if (failure.message === 'INVALID_DOMAIN') setError(strings.errorNotSchoolEmail);
    else if (failure.status === 429 || failure.message === 'RATE_LIMITED') setError(strings.errorTooManyRequests);
    else setError(strings.errorSendFailed);
  }

  async function signIn() {
    setBusy(true);
    setError(null);
    const { error: failure } = await authClient.signIn.emailOtp({ email: email.trim().toLowerCase(), otp: code.trim() });
    setBusy(false);
    // On success the session appears and the layout swaps this screen for the home screen by itself.
    if (failure) setError(strings.errorWrongCode);
  }

  return (
    <Screen>
      <Card>
        <Title>{strings.signInTitle}</Title>
        {step === 'email' ? (
          <>
            <Body tone="muted">{strings.signInIntro}</Body>
            <Body>{strings.emailLabel}</Body>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder={strings.emailPlaceholder}
              placeholderTextColor={colors.muted}
              accessibilityLabel={strings.emailLabel}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
            />
            <Button label={busy ? strings.sending : strings.getCode} disabled={busy || email.trim().length < 5} onPress={sendCode} />
          </>
        ) : (
          <>
            <Body tone="muted">{strings.codeLabel(email.trim().toLowerCase())}</Body>
            <TextInput
              style={styles.input}
              value={code}
              onChangeText={(text) => setCode(text.replace(/\D/g, ''))}
              placeholder={strings.codePlaceholder}
              placeholderTextColor={colors.muted}
              accessibilityLabel={strings.codePlaceholder}
              keyboardType="number-pad"
              maxLength={6}
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
            />
            <Button label={busy ? strings.verifying : strings.verify} disabled={busy || code.length !== 6} onPress={signIn} />
            <Button
              label={strings.useDifferentEmail}
              variant="link"
              onPress={() => {
                setStep('email');
                setCode('');
                setError(null);
              }}
            />
          </>
        )}
        {error ? (
          <Body tone="bad">{error}</Body>
        ) : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { fontSize: 18, minHeight: 52, borderRadius: 14, borderWidth: 1, borderColor: '#cfd6dc', paddingHorizontal: 14, color: colors.ink, backgroundColor: '#fff' },
});
