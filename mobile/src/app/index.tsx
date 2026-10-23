import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { authClient } from '@/lib/auth-client';
import { API_URL, APP_VERSION } from '@/lib/config';
import { fetchHealth, type Health } from '@/lib/health';

/**
 * M01 spike screen: proves the phone can reach the server and sign in with the email code
 * through Better Auth's Expo client. It is replaced by the real sign-in flow in M02.
 */
export default function SpikeScreen() {
  const { data: session, isPending, refetch } = authClient.useSession();
  const [health, setHealth] = useState<Health | 'error' | null>(null);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchHealth().then(setHealth, () => setHealth('error'));
  }, []);

  async function sendCode() {
    setBusy(true);
    setMessage(null);
    const { error } = await authClient.emailOtp.sendVerificationOtp({ email: email.trim(), type: 'sign-in' });
    setBusy(false);
    if (error) setMessage(error.message === 'INVALID_DOMAIN' ? 'That is not a school email address.' : `Could not send the code (${error.message ?? error.status}).`);
    else setStep('code');
  }

  async function signIn() {
    setBusy(true);
    setMessage(null);
    const { error } = await authClient.signIn.emailOtp({ email: email.trim(), otp: code.trim() });
    setBusy(false);
    if (error) setMessage('That code did not work.');
    else await refetch();
  }

  async function signOut() {
    await authClient.signOut();
    setStep('email');
    setCode('');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>overlap</Text>
        <Text style={styles.subtle}>Mobile spike (M01) · app {APP_VERSION}</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Server</Text>
          <Text style={styles.value}>{API_URL}</Text>
          <Text style={styles.label}>Health</Text>
          {health === null ? (
            <ActivityIndicator />
          ) : health === 'error' ? (
            <Text style={[styles.value, styles.bad]}>Cannot reach the server</Text>
          ) : (
            <Text style={[styles.value, styles.good]}>
              OK · api v{health.apiVersion} · minimum app {health.minAppVersion}
            </Text>
          )}
        </View>

        <View style={styles.card}>
          {isPending ? (
            <ActivityIndicator />
          ) : session ? (
            <>
              <Text style={styles.label}>Signed in as</Text>
              <Text style={[styles.value, styles.good]} testID="signed-in-email">
                {session.user.email}
              </Text>
              <Pressable accessibilityRole="button" style={[styles.button, styles.outline]} onPress={signOut}>
                <Text style={styles.outlineText}>Sign out</Text>
              </Pressable>
            </>
          ) : step === 'email' ? (
            <>
              <Text style={styles.label}>School email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@school.ac.kr"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
              />
              <Pressable accessibilityRole="button" style={[styles.button, (busy || !email) && styles.disabled]} disabled={busy || !email} onPress={sendCode}>
                <Text style={styles.buttonText}>{busy ? 'Sending…' : 'Get verification code'}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.label}>6-digit code sent to {email}</Text>
              <TextInput
                style={styles.input}
                value={code}
                onChangeText={setCode}
                placeholder="123456"
                keyboardType="number-pad"
                maxLength={6}
                textContentType="oneTimeCode"
              />
              <Pressable accessibilityRole="button" style={[styles.button, (busy || code.length !== 6) && styles.disabled]} disabled={busy || code.length !== 6} onPress={signIn}>
                <Text style={styles.buttonText}>{busy ? 'Checking…' : 'Sign in'}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => setStep('email')} style={styles.link}>
                <Text style={styles.linkText}>Use a different email</Text>
              </Pressable>
            </>
          )}
          {message ? <Text style={[styles.value, styles.bad]}>{message}</Text> : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#faf8f3' },
  content: { padding: 24, gap: 16 },
  brand: { fontFamily: 'serif', fontSize: 44, fontWeight: '800', color: '#0a8a82' },
  subtle: { color: '#5b6b78', fontSize: 14 },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 20, gap: 10, borderWidth: 1, borderColor: '#e8e4da' },
  label: { fontSize: 13, fontWeight: '700', color: '#5b6b78' },
  value: { fontSize: 16, color: '#12202b' },
  good: { color: '#0a7a52', fontWeight: '700' },
  bad: { color: '#b3261e', fontWeight: '600' },
  input: { fontSize: 18, minHeight: 52, borderRadius: 14, borderWidth: 1, borderColor: '#cfd6dc', paddingHorizontal: 14, color: '#12202b', backgroundColor: '#fff' },
  button: { minHeight: 52, borderRadius: 26, backgroundColor: '#0a8a82', alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  outline: { backgroundColor: '#fff', borderWidth: 2, borderColor: '#0a8a82' },
  outlineText: { color: '#0a8a82', fontSize: 17, fontWeight: '800' },
  disabled: { opacity: 0.5 },
  link: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  linkText: { color: '#0a8a82', fontSize: 16, fontWeight: '600' },
});
