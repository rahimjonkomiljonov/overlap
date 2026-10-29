import { useRouter } from 'expo-router';

import { Body, Button, Card, Screen, Title } from '@/components/ui';
import { strings } from '@/lib/strings';

/** A link that points nowhere (an old or mistyped address): say so plainly and offer the way home, never a blank screen. */
export default function NotFoundScreen() {
  const router = useRouter();
  return (
    <Screen>
      <Card>
        <Title>{strings.notFoundTitle}</Title>
        <Body tone="muted">{strings.notFoundBody}</Body>
        <Button label={strings.notFoundHome} onPress={() => router.replace('/')} />
      </Card>
    </Screen>
  );
}
