import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PickHeading, PickPhoto, ReasonTags, WaveComposer } from '@/components/pick-parts';
import { Body, Button, Card, Loading, Notice, Screen, Title, colors } from '@/components/ui';
import { authClient } from '@/lib/auth-client';
import { API_URL } from '@/lib/config';
import { useMe } from '@/lib/me';
import { picksProblemText, usePicks, type PickCard } from '@/lib/picks';
import { strings } from '@/lib/strings';

const STATUS_NOTICE: Record<string, string> = {
  PAUSED: strings.statusPaused,
  SUSPENDED: strings.statusSuspended,
  BANNED: strings.statusBanned,
};

/** One pick in the list: the person (tap to open) and the Pass button. The actions sit inside the card. */
function PickRow({ card }: { card: PickCard }) {
  const router = useRouter();
  const { pass } = usePicks();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPass() {
    setBusy(true);
    setError(null);
    const problem = await pass(card.id);
    // On success the card has left the list and this row is gone, so only a failure needs to be shown here.
    if (problem) {
      setError(problem);
      setBusy(false);
    }
  }

  return (
    <Card>
      <Pressable accessibilityRole="button" accessibilityLabel={`${card.firstName ?? ''}`} onPress={() => router.push({ pathname: '/pick/[id]', params: { id: card.id } })} style={{ gap: 12 }}>
        {card.photos[0] ? <PickPhoto url={card.photos[0].url} label={card.firstName ?? ''} /> : null}
        <PickHeading card={card} />
        <ReasonTags card={card} limit={3} />
      </Pressable>
      {error ? <Body tone="bad">{error}</Body> : null}
      <WaveComposer cardId={card.id} />
      <Button label={busy ? strings.passing : strings.pass} variant="outline" disabled={busy} onPress={() => void onPass()} />
    </Card>
  );
}

/** The signed-in home: today's picks for every mode the person chose, then the way to verify and to sign out. */
export default function HomeScreen() {
  const router = useRouter();
  const { state: meState } = useMe();
  const { state, refreshing, reload } = usePicks();
  const me = meState.phase === 'ready' ? meState.me : null;

  if (state.phase === 'loading') return <Loading label={strings.loading} />;

  const groups = state.phase === 'ready' ? state.intents : [];
  const multiple = groups.length > 1;

  return (
    <Screen onRefresh={reload} refreshing={refreshing}>
      <View style={{ gap: 4 }}>
        <Title>{strings.picksTitle}</Title>
        <Body tone="muted">{strings.picksIntro}</Body>
      </View>

      {me && STATUS_NOTICE[me.status] ? <Notice>{STATUS_NOTICE[me.status]}</Notice> : null}

      {state.phase === 'failed' ? (
        <Card>
          <Body tone="bad">{picksProblemText({ ok: false, code: state.code, reason: state.reason }, strings.errorPicksLoad)}</Body>
          <Button label={strings.tryAgain} onPress={reload} />
        </Card>
      ) : null}

      {state.phase === 'ready' && groups.length === 0 ? (
        <Card>
          <Title>{strings.picksEmptyTitle}</Title>
          <Body tone="muted">{strings.picksEmptyBody}</Body>
        </Card>
      ) : null}

      {groups.map((group) => (
        <View key={group.intent} style={{ gap: 12 }}>
          {multiple ? (
            <Text style={styles.groupTitle} accessibilityRole="header">
              {strings.intentNames[group.intent] ?? group.intent}
            </Text>
          ) : null}
          {group.items.length === 0 ? (
            <Card>
              <Title>{strings.picksCaughtUpTitle}</Title>
              <Body tone="muted">{strings.picksCaughtUpBody}</Body>
            </Card>
          ) : (
            group.items.map((card) => <PickRow key={card.id} card={card} />)
          )}
        </View>
      ))}

      <Button label={strings.howPicksAreChosen} variant="link" onPress={() => void WebBrowser.openBrowserAsync(`${API_URL}/how-matching-works`)} />

      <Button label={strings.wavesOpen} variant="outline" onPress={() => router.push('/waves')} />
      <Button label={strings.pocketsOpen} variant="outline" onPress={() => router.push('/pockets')} />

      <Card>
        {me ? (
          <>
            <Body tone="muted">{strings.signedInAs}</Body>
            <Body>{me.email}</Body>
          </>
        ) : null}
        <Button label={strings.homeVerify} variant="outline" onPress={() => router.push('/verify')} />
        <Button label={strings.signOut} variant="outline" onPress={() => void authClient.signOut()} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  groupTitle: { fontSize: 18, fontWeight: '800', color: colors.brand },
});
