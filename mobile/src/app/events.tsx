import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Body, Button, Card, Loading, Screen, Title, colors } from '@/components/ui';
import type { ApiResult } from '@/lib/api';
import { eventTimeLabel, fetchEvents, type EventListItem } from '@/lib/events';
import { strings } from '@/lib/strings';

type State = { phase: 'loading' } | { phase: 'failed'; text: string } | { phase: 'ready'; events: EventListItem[] };

function problemText(result: Extract<ApiResult<unknown>, { ok: false }>): string {
  if (result.code === 'NETWORK') return strings.offlineBody;
  if (result.code === 'RATE_LIMITED') return strings.errorTooManyRequests;
  return strings.eventsErrorLoad;
}

function EventRow({ event, onOpen }: { event: EventListItem; onOpen: () => void }) {
  const goingText = event.capacity ? strings.eventsGoingOfCapacity(event.goingCount, event.capacity) : strings.eventsGoing(event.goingCount);
  return (
    <Card>
      <Pressable accessibilityRole="button" accessibilityLabel={event.title} onPress={onOpen} style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Text style={[styles.badge, event.phase === 'connect' && styles.badgeAccent]}>{strings.eventsPhase[event.phase]}</Text>
          {event.imGoing ? <Text style={styles.badgeOutline}>{strings.eventsYouAreGoing}</Text> : null}
        </View>
        <Text style={styles.title}>{event.title}</Text>
        <Body tone="muted">{`${eventTimeLabel(event.startsAt, event.endsAt)} · ${event.spotName}`}</Body>
        <Body tone="muted">{goingText}</Body>
      </Pressable>
    </Card>
  );
}

/** Events on the campus: upcoming, happening now, and the ones still in their 48-hour "pick people you met" window. */
export default function EventsScreen() {
  const router = useRouter();
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [refreshing, setRefreshing] = useState(false);

  const applyResult = useCallback((result: Awaited<ReturnType<typeof fetchEvents>>) => {
    if (result.ok) setState({ phase: 'ready', events: result.data.events });
    else setState({ phase: 'failed', text: problemText(result) });
    setRefreshing(false);
  }, []);

  // Fetches directly in the effect (never calling a function that could itself set state
  // synchronously), matching React's rule against synchronous setState from an effect.
  useEffect(() => {
    let active = true;
    fetchEvents().then((result) => {
      if (active) applyResult(result);
    });
    return () => {
      active = false;
    };
  }, [applyResult]);

  const reload = useCallback(
    (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      fetchEvents().then(applyResult);
    },
    [applyResult],
  );

  if (state.phase === 'loading') return <Loading label={strings.loading} />;

  return (
    <Screen onRefresh={() => reload(true)} refreshing={refreshing}>
      <View style={{ gap: 4 }}>
        <Title>{strings.eventsTitle}</Title>
        <Body tone="muted">{strings.eventsIntro}</Body>
      </View>

      {state.phase === 'failed' ? (
        <Card>
          <Body tone="bad">{state.text}</Body>
          <Button label={strings.tryAgain} onPress={() => reload()} />
        </Card>
      ) : null}

      {state.phase === 'ready' && state.events.length === 0 ? (
        <Card>
          <Title>{strings.eventsEmptyTitle}</Title>
          <Body tone="muted">{strings.eventsEmptyBody}</Body>
        </Card>
      ) : null}

      {state.phase === 'ready'
        ? state.events.map((event) => <EventRow key={event.id} event={event} onOpen={() => router.push({ pathname: '/event/[eventId]', params: { eventId: event.id } })} />)
        : null}

      <Button label={strings.back} variant="outline" onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 20, fontWeight: '800', color: colors.ink },
  badge: { fontSize: 12, fontWeight: '700', color: colors.muted, backgroundColor: colors.background, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, overflow: 'hidden' },
  badgeAccent: { color: '#fff', backgroundColor: colors.brand },
  badgeOutline: { fontSize: 12, fontWeight: '700', color: colors.brand, borderWidth: 1, borderColor: colors.brand, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3, overflow: 'hidden' },
});
