import { useRouter } from 'expo-router';

import { Body, Button, Card, Notice, Screen, Title } from '@/components/ui';
import { authClient } from '@/lib/auth-client';
import { useMe } from '@/lib/me';
import { strings } from '@/lib/strings';

const STATUS_NOTICE: Record<string, string> = {
  PAUSED: strings.statusPaused,
  SUSPENDED: strings.statusSuspended,
  BANNED: strings.statusBanned,
};

/** The fifth tab: who I am, and the places that are mine rather than part of the daily loop (safety, privacy, verification). */
export default function MeScreen() {
  const router = useRouter();
  const { state } = useMe();
  const me = state.phase === 'ready' ? state.me : null;

  return (
    <Screen>
      <Title>{strings.tabMe}</Title>

      {me && STATUS_NOTICE[me.status] ? <Notice>{STATUS_NOTICE[me.status]}</Notice> : null}

      {me ? (
        <Card>
          <Body tone="muted">{strings.signedInAs}</Body>
          <Body>{me.email}</Body>
        </Card>
      ) : null}

      <Button label={strings.pocketsOpen} variant="outline" onPress={() => router.push('/pockets')} />
      <Button label={strings.prefsOpen} variant="outline" onPress={() => router.push('/preferences')} />
      <Button label={strings.safetyOpen} variant="outline" onPress={() => router.push('/safety')} />
      <Button label={strings.privacyOpen} variant="outline" onPress={() => router.push('/privacy')} />
      <Button label={strings.homeVerify} variant="outline" onPress={() => router.push('/verify')} />
      <Button label={strings.signOut} variant="outline" onPress={() => void authClient.signOut()} />
    </Screen>
  );
}
