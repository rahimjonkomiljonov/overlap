import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { PickHeading, PickPhoto, ReasonTags } from '@/components/pick-parts';
import { Body, Button, Card, Screen, Title } from '@/components/ui';
import { usePicks } from '@/lib/picks';
import { strings } from '@/lib/strings';

/**
 * One person in full: every photo, why you overlap and their prompt answers. It reads the pick from the list the home
 * screen already loaded, so it needs no request of its own; if the pick has gone (passed, or the list was refreshed) it
 * says so instead of showing an empty screen.
 */
export default function PickDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { find, pass } = usePicks();
  const card = find(String(id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPass() {
    if (!card) return;
    setBusy(true);
    setError(null);
    const problem = await pass(card.id);
    if (problem) {
      setError(problem);
      setBusy(false);
    } else {
      router.back();
    }
  }

  if (!card) {
    return (
      <Screen>
        <Card>
          <Body tone="muted">{strings.pickGone}</Body>
          <Button label={strings.back} variant="outline" onPress={() => router.back()} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <PickHeading card={card} />
      {card.photos.map((photo, i) => (
        <PickPhoto key={photo.id} url={photo.url} label={strings.photoFor(i + 1)} />
      ))}
      {card.reasons.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Title>{strings.whyYouOverlap}</Title>
          <ReasonTags card={card} />
        </View>
      ) : null}
      {card.prompts.length > 0 ? (
        <View style={{ gap: 12 }}>
          <Title>{strings.aboutThem}</Title>
          {card.prompts.map((prompt) => (
            <Card key={prompt.id}>
              <Body tone="muted">{prompt.question}</Body>
              <Body>{prompt.answer}</Body>
            </Card>
          ))}
        </View>
      ) : null}
      {error ? <Body tone="bad">{error}</Body> : null}
      <Button label={busy ? strings.passing : strings.pass} disabled={busy} onPress={() => void onPass()} />
      <Button label={strings.back} variant="outline" onPress={() => router.back()} />
    </Screen>
  );
}
