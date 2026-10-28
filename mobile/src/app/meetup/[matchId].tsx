import { randomUUID } from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Share, StyleSheet, Text, View } from 'react-native';

import { Chip } from '@/components/form';
import { Body, Button, Card, Loading, Screen, Title, colors } from '@/components/ui';
import type { ApiResult } from '@/lib/api';
import {
  blockLabel,
  cancelMeetup,
  createShareLink,
  customStartMs,
  CUSTOM_MIN_LEAD_MS,
  dayLabel,
  fetchMeetup,
  proposeCustomMeetup,
  proposeMeetup,
  respondToMeetup,
  momentLabel,
  spotLabel,
  submitFeedback,
  whenLabel,
  type EmergencyContact,
  type FeedbackResponse,
  type MeetupProposal,
  type MeetupScreen,
} from '@/lib/meetup';
import { strings } from '@/lib/strings';

type State = { phase: 'loading' } | { phase: 'failed' } | { phase: 'ready'; data: MeetupScreen };

function problemText(result: Extract<ApiResult<unknown>, { ok: false }>): string {
  if (result.code === 'NETWORK') return strings.offlineBody;
  if (result.code === 'RATE_LIMITED') return strings.errorTooManyRequests;
  if (result.code === 'RULE_VIOLATION' && result.reason && strings.meetupErrors[result.reason]) return strings.meetupErrors[result.reason];
  return strings.meetupErrorSave;
}

/** G6: one tap from the meetup screen. A contact with no verified number shows its note instead, never an invented number. */
function EmergencyCard({ contacts }: { contacts: EmergencyContact[] }) {
  const [open, setOpen] = useState(false);
  if (!open) return <Button label={strings.emergencyButton} variant="outline" onPress={() => setOpen(true)} />;
  return (
    <View style={styles.emergency}>
      <Text style={styles.emergencyTitle}>{strings.emergencyTitle}</Text>
      {contacts.map((contact) =>
        contact.phone ? (
          <Button key={contact.key} label={strings.emergencyCall(contact.labelEn, contact.phone)} variant="outline" onPress={() => void Linking.openURL(`tel:${contact.phone}`)} />
        ) : (
          <View key={contact.key} style={{ gap: 2 }}>
            <Text style={styles.contactLabel}>{contact.labelEn}</Text>
            <Body tone="muted">{contact.noteEn ?? ''}</Body>
          </View>
        ),
      )}
      <Button label={strings.emergencyClose} variant="link" onPress={() => setOpen(false)} />
    </View>
  );
}

function OptionsPicker({ data, onDone }: { data: MeetupScreen; onDone: () => void }) {
  const [picked, setPicked] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef(randomUUID());

  async function onPropose() {
    const option = picked === null ? null : data.options[picked];
    if (!option) return;
    setBusy(true);
    setError(null);
    const result = await proposeMeetup(data.matchId, key.current, { spotId: option.spotId, day: option.day, block: option.block });
    setBusy(false);
    if (result.ok) {
      key.current = randomUUID();
      onDone();
      return;
    }
    setError(problemText(result));
  }

  return (
    <Card>
      <Title>{strings.meetupPickTitle}</Title>
      <Body tone="muted">{strings.meetupPickHint}</Body>
      {data.options.map((option, i) => (
        <Chip key={`${option.start}-${option.spotId}`} label={`${whenLabel(option.start)} — ${spotLabel({ name: option.spotName, nameEn: option.spotNameEn })}`} selected={picked === i} onPress={() => setPicked(i)} />
      ))}
      {error ? <Body tone="bad">{error}</Body> : null}
      <Button label={busy ? strings.meetupProposing : strings.meetupPropose} disabled={busy || picked === null} onPress={() => void onPropose()} />
    </Card>
  );
}

function CustomTimeCard({ data, noOverlap, onDone }: { data: MeetupScreen; noOverlap: boolean; onDone: () => void }) {
  const [dayIndex, setDayIndex] = useState<number | null>(null);
  const [block, setBlock] = useState<number | null>(null);
  const [spotId, setSpotId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef(randomUUID());
  const nowMs = new Date(data.now).getTime();

  const tooSoon = (day: string, b: number) => customStartMs(day, b) < nowMs + CUSTOM_MIN_LEAD_MS;

  async function onSubmit() {
    if (dayIndex === null || block === null || spotId === null) return;
    setBusy(true);
    setError(null);
    const result = await proposeCustomMeetup(data.matchId, key.current, { spotId, dayOffset: dayIndex, block });
    setBusy(false);
    if (result.ok) {
      key.current = randomUUID();
      onDone();
      return;
    }
    setError(problemText(result));
  }

  const dayName = (iso: string, i: number) => (i === 0 ? strings.meetupToday : i === 1 ? strings.meetupTomorrow : dayLabel(iso));

  return (
    <Card>
      <Title>{strings.meetupCustomTitle}</Title>
      <Body tone="muted">{noOverlap ? strings.meetupCustomBodyNoOverlap : strings.meetupCustomBodyOverlap}</Body>

      <Text style={styles.groupLabel}>{strings.meetupCustomDay}</Text>
      <View style={styles.chipRow}>
        {data.customDays.map((iso, i) => (
          <Chip
            key={iso}
            label={dayName(iso, i)}
            selected={dayIndex === i}
            disabled={data.customBlocks.every((b) => tooSoon(iso, b))}
            onPress={() => {
              setDayIndex(i);
              if (block !== null && tooSoon(iso, block)) setBlock(null);
            }}
          />
        ))}
      </View>

      <Text style={styles.groupLabel}>{strings.meetupCustomTime}</Text>
      <View style={styles.chipRow}>
        {data.customBlocks.map((b) => (
          <Chip
            key={b}
            label={blockLabel(b)}
            selected={block === b}
            disabled={dayIndex !== null && tooSoon(data.customDays[dayIndex], b)}
            onPress={() => setBlock(b)}
          />
        ))}
      </View>

      <Text style={styles.groupLabel}>{strings.meetupCustomSpot}</Text>
      <View style={styles.chipRow}>
        {data.safeSpots.map((spot) => (
          <Chip key={spot.id} label={spotLabel(spot)} selected={spotId === spot.id} onPress={() => setSpotId(spot.id)} />
        ))}
      </View>

      {error ? <Body tone="bad">{error}</Body> : null}
      <Button label={busy ? strings.meetupProposing : strings.meetupCustomSubmit} disabled={busy || dayIndex === null || block === null || spotId === null} onPress={() => void onSubmit()} />
    </Card>
  );
}

function ProposalCard({ data, proposal, onChanged }: { data: MeetupScreen; proposal: MeetupProposal; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shared, setShared] = useState<{ url: string; expiresAt: string } | null>(null);
  const [feedbackSaved, setFeedbackSaved] = useState<FeedbackResponse | null>(null);
  const shareKey = useRef(randomUUID());

  const name = data.other.firstName ?? '';
  const isProposer = proposal.proposedByUserId !== data.other.userId;
  const isPast = new Date(proposal.scheduledEnd).getTime() < new Date(data.now).getTime();
  const myFeedback = feedbackSaved ?? proposal.myFeedbackResponse;

  async function run(action: () => Promise<ApiResult<unknown>>, after?: () => void) {
    setBusy(true);
    setError(null);
    const result = await action();
    setBusy(false);
    if (result.ok) {
      after?.();
      onChanged();
      return;
    }
    setError(problemText(result));
    // The other person may have answered meanwhile: show what is true now.
    if (result.code === 'RULE_VIOLATION') onChanged();
  }

  async function onShare() {
    setBusy(true);
    setError(null);
    const result = await createShareLink(proposal.proposalId, shareKey.current);
    setBusy(false);
    if (result.ok) {
      shareKey.current = randomUUID();
      setShared({ url: result.data.url, expiresAt: result.data.expiresAt });
      return;
    }
    setError(problemText(result));
  }

  return (
    <Card>
      <Title>{proposal.status === 'ACCEPTED' ? strings.meetupStatusAccepted : strings.meetupStatusProposed}</Title>
      <Text style={styles.when}>{whenLabel(proposal.scheduledStart)}</Text>
      <Body tone="muted">{spotLabel({ name: proposal.spotName, nameEn: proposal.spotNameEn })}</Body>
      <Body>{strings.meetupWith(name)}</Body>

      {proposal.status === 'PROPOSED' ? (
        <>
          <Body tone="muted">{isProposer ? strings.meetupWaitingFor(name) : strings.meetupSuggestedBy(name)}</Body>
          {isProposer ? (
            <Button label={strings.meetupWithdraw} variant="outline" disabled={busy} onPress={() => void run(() => respondToMeetup(proposal.proposalId, 'DECLINE'))} />
          ) : (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button label={strings.meetupDecline} variant="outline" disabled={busy} onPress={() => void run(() => respondToMeetup(proposal.proposalId, 'DECLINE'))} />
              <Button label={strings.meetupAccept} disabled={busy} onPress={() => void run(() => respondToMeetup(proposal.proposalId, 'ACCEPT'))} />
            </View>
          )}
        </>
      ) : (
        <>
          {shared ? (
            <View style={styles.shareBox}>
              <Text style={styles.contactLabel}>{strings.meetupShareReady}</Text>
              <Body>{shared.url}</Body>
              <Body tone="muted">{strings.meetupShareExpires(momentLabel(shared.expiresAt))}</Body>
              <Button label={strings.meetupShareSend} onPress={() => void Share.share({ message: strings.meetupShareMessage(name, shared.url) })} />
            </View>
          ) : (
            <Button label={busy ? strings.meetupSharing : strings.meetupSharePlans} variant="outline" disabled={busy} onPress={() => void onShare()} />
          )}
          <Button label={strings.meetupCancel} variant="outline" disabled={busy} onPress={() => void run(() => cancelMeetup(proposal.proposalId))} />

          {isPast && myFeedback === null ? (
            <View style={{ gap: 8 }}>
              <Text style={styles.contactLabel}>{strings.meetupFeedbackPrompt}</Text>
              {(['GREAT', 'FINE', 'NOT_FOR_ME', 'UNCOMFORTABLE'] as const).map((response) => (
                <Button key={response} label={strings.meetupFeedback[response]} variant="outline" disabled={busy} onPress={() => void run(() => submitFeedback(proposal.proposalId, response), () => setFeedbackSaved(response))} />
              ))}
            </View>
          ) : null}
          {isPast && myFeedback !== null ? <Body tone="good">{strings.meetupFeedbackThanks}</Body> : null}
          {myFeedback === 'UNCOMFORTABLE' ? <Body tone="muted">{strings.meetupFeedbackUncomfortable}</Body> : null}
        </>
      )}

      {error ? <Body tone="bad">{error}</Body> : null}
    </Card>
  );
}

/** One match's meetup: pick or suggest a time at a Safe Spot, answer one, confirm, share the plan, check in afterwards. */
export default function MeetupScreenRoute() {
  const router = useRouter();
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const id = String(matchId);
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [refreshing, setRefreshing] = useState(false);

  const applyResult = useCallback((result: Awaited<ReturnType<typeof fetchMeetup>>) => {
    if (result.ok) setState({ phase: 'ready', data: result.data });
    else setState((current) => (current.phase === 'ready' ? current : { phase: 'failed' }));
    setRefreshing(false);
  }, []);

  // Fetches directly in the effect (never calling a function that could itself set state
  // synchronously), matching React's rule against synchronous setState from an effect.
  useEffect(() => {
    let active = true;
    fetchMeetup(id).then((result) => {
      if (active) applyResult(result);
    });
    return () => {
      active = false;
    };
  }, [id, applyResult]);

  const reload = useCallback(() => {
    fetchMeetup(id).then(applyResult);
  }, [id, applyResult]);

  // Pull down to see the other person's answer.
  const pullToRefresh = () => {
    setRefreshing(true);
    reload();
  };

  if (state.phase === 'loading') return <Loading label={strings.loading} />;

  if (state.phase === 'failed') {
    return (
      <Screen>
        <Card>
          <Body tone="bad">{strings.meetupErrorLoad}</Body>
          <Button label={strings.tryAgain} onPress={() => { setState({ phase: 'loading' }); reload(); }} />
          <Button label={strings.meetupBack} variant="outline" onPress={() => router.back()} />
        </Card>
      </Screen>
    );
  }

  const { data } = state;

  return (
    <Screen onRefresh={pullToRefresh} refreshing={refreshing}>
      <Title>{strings.meetupTitle}</Title>
      <Body tone="muted">{strings.meetupWith(data.other.firstName ?? '')}</Body>

      {data.proposal ? (
        <ProposalCard data={data} proposal={data.proposal} onChanged={reload} />
      ) : (
        <>
          {data.options.length > 0 ? <OptionsPicker data={data} onDone={reload} /> : null}
          {data.safeSpots.length > 0 ? (
            <CustomTimeCard data={data} noOverlap={data.options.length === 0} onDone={reload} />
          ) : data.options.length === 0 ? (
            <Card>
              <Title>{strings.meetupNoOptionsTitle}</Title>
              <Body tone="muted">{strings.meetupNoSpotsBody}</Body>
            </Card>
          ) : null}
        </>
      )}

      <Card>
        <Title>{strings.meetupSafetyTitle}</Title>
        {strings.meetupSafetyTips.map((tip) => (
          <Body key={tip}>{tip}</Body>
        ))}
      </Card>

      <EmergencyCard contacts={data.emergencyContacts} />

      <Button label={strings.meetupBack} variant="outline" onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  when: { fontSize: 18, fontWeight: '700', color: colors.ink },
  groupLabel: { fontSize: 13, fontWeight: '700', color: colors.muted },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  contactLabel: { fontSize: 14, fontWeight: '700', color: colors.ink },
  emergency: { gap: 10, borderRadius: 20, borderWidth: 1, borderColor: colors.bad, backgroundColor: '#fdecea', padding: 16 },
  emergencyTitle: { fontSize: 16, fontWeight: '800', color: colors.bad },
  shareBox: { gap: 6, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12 },
});
