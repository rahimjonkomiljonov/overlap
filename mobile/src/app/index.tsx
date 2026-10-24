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

/** The signed-in home. For now it shows who you are and the account's state; the real home comes with picks. */
export default function HomeScreen() {
  const router = useRouter();
  const { state } = useMe();
  const me = state.phase === 'ready' ? state.me : null;

  return (
    <Screen>
      <Card>
        {me ? (
          <>
            <Body tone="muted">{strings.signedInAs}</Body>
            <Title>{me.email}</Title>
            {STATUS_NOTICE[me.status] ? <Notice>{STATUS_NOTICE[me.status]}</Notice> : null}
          </>
        ) : null}
        <Button label={strings.homeVerify} onPress={() => router.push('/verify')} />
        <Button label={strings.signOut} variant="outline" onPress={() => void authClient.signOut()} />
      </Card>
    </Screen>
  );
}
