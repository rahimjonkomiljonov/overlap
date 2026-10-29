import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';

import { Body, Button, Card, Loading, Screen, Title } from '@/components/ui';
import { authClient } from '@/lib/auth-client';
import { fetchHealth } from '@/lib/health';
import { MeProvider, useMe } from '@/lib/me';
import { PicksProvider } from '@/lib/picks';
import { configureForeground, listenForNotificationTaps, screenForNotificationPath } from '@/lib/push';
import { strings } from '@/lib/strings';

configureForeground();

/**
 * Opens the right screen when a notification is tapped, including the tap that launched the app. Only mounted
 * for someone who can see those screens; the notification carries a generic path, never a name or message.
 */
function NotificationTaps() {
  const router = useRouter();
  useEffect(() => {
    let lastId: string | null = null;
    return listenForNotificationTaps((path, id) => {
      // The launch tap can be reported twice (by the listener and by the "last response" lookup).
      if (id === lastId) return;
      lastId = id;
      const screen = screenForNotificationPath(path);
      if (screen) router.push(screen);
    });
  }, [router]);
  return null;
}

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

function Offline({ onRetry }: { onRetry: () => void }) {
  return (
    <Screen>
      <Card>
        <Title>{strings.offlineTitle}</Title>
        <Body tone="muted">{strings.offlineBody}</Body>
        <Button label={strings.tryAgain} onPress={onRetry} />
      </Card>
    </Screen>
  );
}

/**
 * Which screens exist depends on who is looking: signed out sees only sign-in; signed in but not
 * yet set up sees only the setup; set up sees the app. Expo Router removes a screen the moment its
 * guard turns false, so nobody can open one that is not theirs.
 */
function Routes({ signedIn }: { signedIn: boolean }) {
  const { state, refresh } = useMe();

  if (signedIn && state.phase === 'loading') return <Loading label={strings.loading} />;
  if (signedIn && state.phase === 'failed') return <Offline onRetry={refresh} />;

  const setUp = state.phase === 'ready' && state.me.accountSetupComplete;
  const profileDone = setUp && state.phase === 'ready' && state.me.profileComplete;
  return (
    <PicksProvider enabled={signedIn && profileDone}>
      <StatusBar style="dark" />
      {signedIn && profileDone ? <NotificationTaps /> : null}
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#faf8f3' } }}>
        <Stack.Protected guard={signedIn && setUp && !profileDone}>
          <Stack.Screen name="profile" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && profileDone}>
          <Stack.Screen name="index" />
          <Stack.Screen name="pick/[id]" />
          <Stack.Screen name="waves" />
          <Stack.Screen name="pockets" />
          <Stack.Screen name="pocket/[kind]/[id]" />
          <Stack.Screen name="events" />
          <Stack.Screen name="event/[eventId]" />
          <Stack.Screen name="safety" />
          <Stack.Screen name="privacy" />
          <Stack.Screen name="preferences" />
          <Stack.Screen name="matches" />
          <Stack.Screen name="chat/[conversationId]" />
          <Stack.Screen name="meetup/[matchId]" />
          <Stack.Screen name="verify" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !setUp}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
      </Stack>
    </PicksProvider>
  );
}

export default function RootLayout() {
  const { gate, retry } = useGate();
  const { data: session, isPending } = authClient.useSession();

  if (gate === 'checking' || (gate === 'ready' && isPending)) return <Loading label={strings.loading} />;
  if (gate === 'offline') return <Offline onRetry={retry} />;

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

  // Keyed by the person, so a different account never inherits the previous one's answers.
  return (
    <MeProvider key={session?.user.id ?? 'signed-out'} enabled={!!session}>
      <Routes signedIn={!!session} />
    </MeProvider>
  );
}
