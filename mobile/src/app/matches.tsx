import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { SafetyActions } from '@/components/safety-actions';
import { Body, Button, Card, Loading, Screen, Title, colors } from '@/components/ui';
import { imageSource, type ApiResult } from '@/lib/api';
import { fetchMatches, unmatch, type MatchSummary } from '@/lib/matches';
import { useCookie } from '@/lib/use-cookie';
import { strings } from '@/lib/strings';

type State = { phase: 'loading' } | { phase: 'failed'; text: string } | { phase: 'ready'; matches: MatchSummary[] };

function matchesProblemText(result: Extract<ApiResult<unknown>, { ok: false }>): string {
  if (result.code === 'NETWORK') return strings.offlineBody;
  if (result.code === 'RATE_LIMITED') return strings.errorTooManyRequests;
  return strings.errorMatchesLoad;
}

function MatchPhoto({ url, label }: { url: string | null; label: string }) {
  const cookie = useCookie();
  if (!url || !cookie) {
    return (
      <View style={[styles.photo, styles.photoFallback]}>
        <Text style={styles.photoInitial}>{label[0] ?? '?'}</Text>
      </View>
    );
  }
  return <Image source={imageSource(url, cookie)} style={styles.photo} accessibilityLabel={label} contentFit="cover" />;
}

function MatchRow({ match, onUnmatched }: { match: MatchSummary; onUnmatched: (matchId: string) => void }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onUnmatch() {
    setBusy(true);
    setError(null);
    const result = await unmatch(match.matchId);
    if (result.ok) {
      onUnmatched(match.matchId);
      return;
    }
    setBusy(false);
    setError(strings.errorUnmatch);
  }

  const name = match.firstName ?? '?';
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <MatchPhoto url={match.photoUrl} label={name} />
        <Text style={styles.name}>{name}</Text>
      </View>

      {error ? <Body tone="bad">{error}</Body> : null}

      {confirming ? (
        <View style={{ gap: 8 }}>
          <Body tone="muted">{strings.matchesUnmatchConfirm}</Body>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button label={strings.matchesUnmatchCancel} variant="outline" disabled={busy} onPress={() => setConfirming(false)} />
            <Button label={busy ? strings.saving : strings.matchesUnmatch} disabled={busy} onPress={() => void onUnmatch()} />
          </View>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button label={strings.matchesUnmatch} variant="outline" onPress={() => setConfirming(true)} />
          {match.conversationId ? (
            <Button
              label={strings.matchesChat}
              onPress={() => router.push({ pathname: '/chat/[conversationId]', params: { conversationId: match.conversationId! } })}
            />
          ) : null}
        </View>
      )}

      <SafetyActions targetUserId={match.otherUserId} conversationId={match.conversationId ?? undefined} onBlocked={() => onUnmatched(match.matchId)} />
    </Card>
  );
}

const POLL_INTERVAL_MS = 15_000;

/** Every active match, most recent first — the chat entry point. */
export default function MatchesScreen() {
  const router = useRouter();
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [refreshing, setRefreshing] = useState(false);

  const applyResult = useCallback((result: Awaited<ReturnType<typeof fetchMatches>>) => {
    if (result.ok) setState({ phase: 'ready', matches: result.data.matches });
    else setState((current) => (current.phase === 'ready' ? current : { phase: 'failed', text: matchesProblemText(result) }));
    setRefreshing(false);
  }, []);

  // Fetches directly in the effect (never calling a function that could itself set state
  // synchronously), matching React's rule against synchronous setState from an effect.
  useEffect(() => {
    let active = true;
    fetchMatches().then((result) => {
      if (active) applyResult(result);
    });
    return () => {
      active = false;
    };
  }, [applyResult]);

  // Coming back from a chat (where the person may have been blocked) must show the list as it is now.
  useFocusEffect(
    useCallback(() => {
      fetchMatches().then(applyResult);
    }, [applyResult]),
  );

  const reload = useCallback(
    (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      fetchMatches().then(applyResult);
    },
    [applyResult],
  );

  // A newly formed match should show up without a manual refresh, same as the website's 15s poll.
  useEffect(() => {
    const id = setInterval(() => fetchMatches().then(applyResult), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [applyResult]);

  function removeLocally(matchId: string) {
    setState((current) => (current.phase === 'ready' ? { phase: 'ready', matches: current.matches.filter((m) => m.matchId !== matchId) } : current));
  }

  if (state.phase === 'loading') return <Loading label={strings.loading} />;

  return (
    <Screen onRefresh={() => reload(true)} refreshing={refreshing}>
      <Title>{strings.matchesTitle}</Title>

      {state.phase === 'failed' ? (
        <Card>
          <Body tone="bad">{state.text}</Body>
          <Button label={strings.tryAgain} onPress={() => reload()} />
        </Card>
      ) : null}

      {state.phase === 'ready' && state.matches.length === 0 ? (
        <Card>
          <Title>{strings.matchesEmptyTitle}</Title>
          <Body tone="muted">{strings.matchesEmptyBody}</Body>
        </Card>
      ) : null}

      {state.phase === 'ready' ? state.matches.map((match) => <MatchRow key={match.matchId} match={match} onUnmatched={removeLocally} />) : null}

      <Button label={strings.back} variant="outline" onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  name: { fontSize: 16, fontWeight: '700', color: colors.ink, flex: 1 },
  photo: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.border },
  photoFallback: { alignItems: 'center', justifyContent: 'center' },
  photoInitial: { fontSize: 18, fontWeight: '800', color: colors.muted },
});
