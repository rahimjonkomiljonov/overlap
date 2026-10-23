import { useEffect, useState } from 'react';

import { Body, Button, Card, Loading, Notice, Screen, Title } from '@/components/ui';
import { apiGet } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { strings } from '@/lib/strings';

type Me = { userId: string; email: string; name: string; role: string; status: string; accountSetupComplete: boolean };

const STATUS_NOTICE: Record<string, string> = {
  PAUSED: strings.statusPaused,
  SUSPENDED: strings.statusSuspended,
  BANNED: strings.statusBanned,
};

/** The signed-in home. For now it asks the server who you are and shows the account's state. */
export default function HomeScreen() {
  const [me, setMe] = useState<Me | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiGet<Me>('/me').then(async (result) => {
      if (!active) return;
      if (result.ok) return setMe(result.data);
      // The server no longer accepts this session (expired, or the account is gone): sign out
      // locally and the layout shows the sign-in screen.
      if (result.code === 'UNAUTHENTICATED') return void authClient.signOut();
      setProblem(strings.offlineBody);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!me && !problem) return <Loading label={strings.loading} />;

  return (
    <Screen>
      <Card>
        {me ? (
          <>
            <Body tone="muted">{strings.signedInAs}</Body>
            <Title>{me.email}</Title>
            {STATUS_NOTICE[me.status] ? <Notice>{STATUS_NOTICE[me.status]}</Notice> : null}
            {!me.accountSetupComplete && me.status === 'ACTIVE' ? <Body tone="muted">{strings.accountSetupNext}</Body> : null}
          </>
        ) : (
          <Body tone="bad">{problem}</Body>
        )}
        <Button label={strings.signOut} variant="outline" onPress={() => void authClient.signOut()} />
      </Card>
    </Screen>
  );
}
