import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';

import { Body, Button, Card, Loading, Screen, Title } from '@/components/ui';
import { authClient } from '@/lib/auth-client';
import { fetchHealth } from '@/lib/health';
import { strings } from '@/lib/strings';

type Gate = 'checking' | 'offline' | 'upgrade' | 'ready';

/**
 * What the app does before showing anything else: ask the server whether it is reachable and
 * whether this version of the app is still accepted. Only then does it look at the session.
 */
function useGate(): { gate: Gate; retry: () => void } {
  const [gate, setGate] = useState<Gate>('checking');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    fetchHealth().then(
      (health) => active && setGate(health.supported === false ? 'upgrade' : 'ready'),
      () => active && setGate('offline'),
    );
    return () => {
      active = false;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setGate('checking');
    setAttempt((n) => n + 1);
  }, []);

  return { gate, retry };
}

export default function RootLayout() {
  const { gate, retry } = useGate();
  const { data: session, isPending } = authClient.useSession();

  if (gate === 'checking' || (gate === 'ready' && isPending)) return <Loading label={strings.loading} />;

  if (gate === 'offline') {
    return (
      <Screen>
        <Card>
          <Title>{strings.offlineTitle}</Title>
          <Body tone="muted">{strings.offlineBody}</Body>
          <Button label={strings.tryAgain} onPress={retry} />
        </Card>
      </Screen>
    );
  }

  if (gate === 'upgrade') {
    return (
      <Screen>
        <Card>
          <Title>{strings.upgradeTitle}</Title>
          <Body tone="muted">{strings.upgradeBody}</Body>
          <Button label={strings.tryAgain} variant="outline" onPress={retry} />
        </Card>
      </Screen>
    );
  }

  const signedIn = !!session;
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#faf8f3' } }}>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="index" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
      </Stack>
    </>
  );
}
