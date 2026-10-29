import { randomUUID } from 'expo-crypto';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Chip, SwitchRow } from '@/components/form';
import { Body, Button, Card, Loading, Screen, Title } from '@/components/ui';
import { imageSource, type ApiResult } from '@/lib/api';
import { connectAtEvent, eventTimeLabel, fetchEvent, setRsvp, type EventDetail, type Guest } from '@/lib/events';
import { strings } from '@/lib/strings';
import { useCookie } from '@/lib/use-cookie';
import { useStyles, type Palette } from '@/lib/theme';

type State = { phase: 'loading' } | { phase: 'failed' } | { phase: 'ready'; event: EventDetail };

function problemText(result: Extract<ApiResult<unknown>, { ok: false }>): string {
  if (result.code === 'NETWORK') return strings.offlineBody;
  if (result.code === 'RATE_LIMITED') return strings.errorTooManyRequests;
  if (result.code === 'NOT_FOUND') return strings.eventsErrors.NOT_FOUND;
  if (result.code === 'RULE_VIOLATION' && result.reason && strings.eventsErrors[result.reason]) return strings.eventsErrors[result.reason];
  return strings.eventsErrorSave;
}

function GuestPhoto({ url, label }: { url: string | null; label: string }) {
  const styles = useStyles(makeStyles);
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

function RsvpCard({ event, onSaved }: { event: EventDetail; onSaved: () => void }) {
  const styles = useStyles(makeStyles);
  const [going, setGoing] = useState(event.myRsvp !== null);
  const [showMe, setShowMe] = useState(event.myRsvp?.showInGuestList ?? false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function onSave() {
    setBusy(true);
    setMessage(null);
    const result = await setRsvp(event.id, going, going && showMe);
    setBusy(false);
    if (result.ok) {
      setMessage({ ok: true, text: strings.eventsSaved });
      onSaved();
      return;
    }
    setMessage({ ok: false, text: problemText(result) });
  }

  return (
    <Card>
      <Title>{strings.eventsRsvpTitle}</Title>
      <View style={styles.chipRow}>
        <Chip label={strings.eventsGoingYes} selected={going} onPress={() => setGoing(true)} />
        <Chip label={strings.eventsGoingNo} selected={!going} onPress={() => setGoing(false)} />
      </View>
      {going ? (
        <>
          <SwitchRow value={showMe} onChange={setShowMe} label={strings.eventsShowMe} />
          <Body tone="muted">{strings.eventsShowMeHint}</Body>
        </>
      ) : null}
      {message ? <Body tone={message.ok ? 'good' : 'bad'}>{message.text}</Body> : null}
      <Button label={busy ? strings.eventsSaving : strings.eventsSave} disabled={busy} onPress={() => void onSave()} />
    </Card>
  );
}

function GuestRow({ eventId, guest, canConnect, onChanged }: { eventId: string; guest: Guest; canConnect: boolean; onChanged: (next: Guest) => void }) {
  const styles = useStyles(makeStyles);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matchedNow, setMatchedNow] = useState(false);
  const key = useRef(randomUUID());

  async function onConnect() {
    setBusy(true);
    setError(null);
    const result = await connectAtEvent(eventId, guest.userId, key.current);
    setBusy(false);
    if (result.ok) {
      key.current = randomUUID();
      if (result.data.matched) setMatchedNow(true);
      onChanged({ ...guest, connected: true, matched: guest.matched || result.data.matched });
      return;
    }
    setError(problemText(result));
  }

  const name = guest.firstName ?? '?';
  return (
    <View style={styles.guestRow}>
      <GuestPhoto url={guest.photoUrl} label={name} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.guestName}>{name}</Text>
        {guest.overlap > 0 ? <Body tone="muted">{strings.eventsOverlap(guest.overlap)}</Body> : null}
        {error ? <Body tone="bad">{error}</Body> : null}
        {matchedNow ? <Body tone="good">{strings.eventsMatchedNow}</Body> : null}
      </View>
      {guest.matched ? (
        <Text style={styles.statusMatched}>{strings.eventsMatched}</Text>
      ) : guest.connected ? (
        <Text style={styles.statusPicked}>{strings.eventsConnected}</Text>
      ) : canConnect ? (
        <Button label={busy ? strings.eventsConnecting : strings.eventsConnect} disabled={busy} onPress={() => void onConnect()} />
      ) : null}
    </View>
  );
}

/** One event: details, RSVP with the opt-in "show me", who is going, and the 48-hour "we met" window. */
export default function EventScreen() {
  const styles = useStyles(makeStyles);
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const id = String(eventId);
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [refreshing, setRefreshing] = useState(false);

  const applyResult = useCallback((result: Awaited<ReturnType<typeof fetchEvent>>) => {
    if (result.ok) setState({ phase: 'ready', event: result.data });
    else setState((current) => (current.phase === 'ready' ? current : { phase: 'failed' }));
    setRefreshing(false);
  }, []);

  // Fetches directly in the effect (never calling a function that could itself set state
  // synchronously), matching React's rule against synchronous setState from an effect.
  useEffect(() => {
    let active = true;
    fetchEvent(id).then((result) => {
      if (active) applyResult(result);
    });
    return () => {
      active = false;
    };
  }, [id, applyResult]);

  const reload = useCallback(() => {
    fetchEvent(id).then(applyResult);
  }, [id, applyResult]);

  function changeGuest(next: Guest) {
    setState((current) =>
      current.phase === 'ready' ? { phase: 'ready', event: { ...current.event, guests: current.event.guests.map((g) => (g.userId === next.userId ? next : g)) } } : current,
    );
  }

  if (state.phase === 'loading') return <Loading label={strings.loading} />;

  if (state.phase === 'failed') {
    return (
      <Screen>
        <Card>
          <Body tone="bad">{strings.eventsErrorLoad}</Body>
          <Button label={strings.tryAgain} onPress={() => { setState({ phase: 'loading' }); reload(); }} />
          <Button label={strings.eventsBackToList} variant="outline" onPress={() => router.back()} />
        </Card>
      </Screen>
    );
  }

  const { event } = state;
  const going = event.myRsvp !== null;
  const showGuests = event.phase !== 'closed' && event.phase !== 'cancelled';

  return (
    <Screen onRefresh={() => { setRefreshing(true); reload(); }} refreshing={refreshing}>
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Text style={[styles.badge, event.phase === 'connect' && styles.badgeAccent]}>{strings.eventsPhase[event.phase]}</Text>
          {going ? <Text style={styles.badgeOutline}>{strings.eventsYouAreGoing}</Text> : null}
        </View>
        <Title>{event.title}</Title>
        <Body tone="muted">{`${eventTimeLabel(event.startsAt, event.endsAt)} · ${event.spotName}`}</Body>
        {event.organizerFirstName ? <Body tone="muted">{strings.eventsHostedBy(event.organizerFirstName)}</Body> : null}
        <Body tone="muted">{event.capacity ? strings.eventsGoingOfCapacity(event.goingCount, event.capacity) : strings.eventsGoing(event.goingCount)}</Body>
      </View>

      <Body>{event.description}</Body>

      {event.canRsvp ? <RsvpCard event={event} onSaved={reload} /> : null}

      {showGuests ? (
        <Card>
          <Title>{strings.eventsGuestsTitle}</Title>
          {event.phase === 'connect' && going ? <Body tone="muted">{strings.eventsConnectHint}</Body> : null}
          {!event.viewerVerified ? (
            <Body tone="muted">{strings.eventsVerifyToSee}</Body>
          ) : event.guests.length === 0 ? (
            <Body tone="muted">{strings.eventsGuestsEmpty}</Body>
          ) : (
            <>
              <Body tone="muted">{strings.eventsGuestsHint}</Body>
              {event.guests.map((guest) => (
                <GuestRow key={guest.userId} eventId={event.id} guest={guest} canConnect={event.canConnect} onChanged={changeGuest} />
              ))}
            </>
          )}
        </Card>
      ) : null}

      <Button label={strings.eventsBackToList} variant="outline" onPress={() => router.back()} />
    </Screen>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badge: { fontSize: 12, fontWeight: '700', color: colors.muted, backgroundColor: colors.card, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, overflow: 'hidden' },
  badgeAccent: { color: colors.onBrand, backgroundColor: colors.brand },
  badgeOutline: { fontSize: 12, fontWeight: '700', color: colors.brand, borderWidth: 1, borderColor: colors.brand, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3, overflow: 'hidden' },
  guestRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  guestName: { fontSize: 16, fontWeight: '700', color: colors.ink },
  photo: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.border },
  photoFallback: { alignItems: 'center', justifyContent: 'center' },
  photoInitial: { fontSize: 18, fontWeight: '800', color: colors.muted },
  statusMatched: { fontSize: 13, fontWeight: '800', color: colors.good },
  statusPicked: { fontSize: 13, fontWeight: '700', color: colors.muted },
});
