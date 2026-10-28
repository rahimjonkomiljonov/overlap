import { randomUUID } from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { Field } from '@/components/form';
import { Body, Button, Card, Loading, Notice, Screen, Title, colors } from '@/components/ui';
import { imageSource, type ApiResult } from '@/lib/api';
import { fetchChatDetail, icebreakerSuggestions, reviveConversation, sendMessage, type ChatDetail } from '@/lib/chat';
import { useCookie } from '@/lib/use-cookie';
import { useMe } from '@/lib/me';
import { strings } from '@/lib/strings';

const POLL_INTERVAL_MS = 3_000;

type State = { phase: 'loading' } | { phase: 'failed'; text: string } | { phase: 'ready'; data: ChatDetail };

function chatProblemText(result: Extract<ApiResult<unknown>, { ok: false }>): string {
  if (result.code === 'NETWORK') return strings.offlineBody;
  if (result.code === 'RATE_LIMITED') return strings.errorTooManyRequests;
  return strings.errorChatLoad;
}

function sendProblemText(result: Extract<ApiResult<unknown>, { ok: false }>): string {
  if (result.code === 'NETWORK') return strings.offlineBody;
  if (result.code === 'RATE_LIMITED') return strings.errorTooManyRequests;
  if (result.code === 'RULE_VIOLATION' && result.reason === 'UNMATCHED') return strings.errorChatUnmatched;
  if (result.code === 'RULE_VIOLATION' && result.reason === 'EXPIRED') return strings.errorChatExpired;
  return strings.errorChatSend;
}

function OtherPhoto({ url, label }: { url: string | null; label: string }) {
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

/** One chat thread: messages, icebreakers while it is still empty, and the composer. Polls every 3s while open, same cadence as the website. */
export default function ChatScreen() {
  const router = useRouter();
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const id = String(conversationId);
  const { state: meState } = useMe();
  const myUserId = meState.phase === 'ready' ? meState.me.userId : null;

  const [state, setState] = useState<State>({ phase: 'loading' });
  const [text, setText] = useState('');
  const [sendBusy, setSendBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [reviveBusy, setReviveBusy] = useState(false);
  const key = useRef(randomUUID());

  const applyResult = useCallback((result: Awaited<ReturnType<typeof fetchChatDetail>>) => {
    if (result.ok) setState({ phase: 'ready', data: result.data });
    else setState((current) => (current.phase === 'ready' ? current : { phase: 'failed', text: chatProblemText(result) }));
  }, []);

  // Fetches directly in the effect (never calling a function that could itself set state
  // synchronously), matching React's rule against synchronous setState from an effect.
  useEffect(() => {
    let active = true;
    fetchChatDetail(id).then((result) => {
      if (active) applyResult(result);
    });
    return () => {
      active = false;
    };
  }, [id, applyResult]);

  useEffect(() => {
    const interval = setInterval(() => fetchChatDetail(id).then(applyResult), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [id, applyResult]);

  async function onSend() {
    const value = text.trim();
    if (!value) return;
    setSendBusy(true);
    setSendError(null);
    const result = await sendMessage(id, key.current, value);
    setSendBusy(false);
    if (result.ok) {
      key.current = randomUUID();
      setText('');
      fetchChatDetail(id).then(applyResult);
      return;
    }
    setSendError(sendProblemText(result));
  }

  async function onRevive() {
    setReviveBusy(true);
    const result = await reviveConversation(id);
    setReviveBusy(false);
    if (result.ok) fetchChatDetail(id).then(applyResult);
  }

  if (state.phase === 'loading') return <Loading label={strings.loading} />;

  if (state.phase === 'failed') {
    return (
      <Screen>
        <Card>
          <Body tone="bad">{state.text}</Body>
          <Button label={strings.tryAgain} onPress={() => fetchChatDetail(id).then(applyResult)} />
          <Button label={strings.chatBackToMatches} variant="outline" onPress={() => router.back()} />
        </Card>
      </Screen>
    );
  }

  const { data } = state;
  const name = data.otherFirstName ?? '?';

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <OtherPhoto url={data.otherPhotoUrl} label={name} />
        <Title>{name}</Title>
      </View>

      {data.messages.length === 0 ? (
        <Card>
          <Text style={styles.icebreakersHeading}>{strings.chatIcebreakersHeading}</Text>
          {icebreakerSuggestions(data.icebreakers).map((suggestion, i) => (
            <Button key={i} label={suggestion} variant="outline" onPress={() => setText(suggestion)} />
          ))}
        </Card>
      ) : null}

      {data.messages.map((message) => {
        const mine = message.senderId === myUserId;
        return (
          <View key={message.id} style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
            <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
              <Text style={mine ? styles.bubbleTextMine : styles.bubbleTextTheirs}>{message.text}</Text>
            </View>
          </View>
        );
      })}

      {sendError ? <Body tone="bad">{sendError}</Body> : null}

      {!data.canInteract && data.matchStatus === 'UNMATCHED' ? <Notice>{strings.chatUnmatchedNotice}</Notice> : null}

      {data.matchStatus === 'ACTIVE' && data.status === 'EXPIRED' ? (
        <Card>
          <Body tone="muted">{data.revivedAt ? strings.chatExpiredPermanently : strings.chatExpiredNotice}</Body>
          {!data.revivedAt ? (
            <Button label={reviveBusy ? strings.chatReviving : strings.chatRevive} disabled={reviveBusy} onPress={() => void onRevive()} />
          ) : null}
        </Card>
      ) : null}

      {data.canInteract ? (
        <View style={{ gap: 8 }}>
          <Field
            label={strings.chatComposerPlaceholder}
            value={text}
            onChangeText={setText}
            placeholder={strings.chatComposerPlaceholder}
            editable={!sendBusy}
          />
          <Button label={sendBusy ? strings.chatSending : strings.chatSend} disabled={sendBusy || text.trim().length === 0} onPress={() => void onSend()} />
        </View>
      ) : null}

      {data.matchStatus === 'ACTIVE' ? (

        <Button label={strings.chatPlanMeetup} variant="outline" onPress={() => router.push({ pathname: '/meetup/[matchId]', params: { matchId: data.matchId } })} />

      ) : null}

      <Button label={strings.chatBackToMatches} variant="outline" onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  photo: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.border },
  photoFallback: { alignItems: 'center', justifyContent: 'center' },
  photoInitial: { fontSize: 16, fontWeight: '800', color: colors.muted },
  icebreakersHeading: { fontSize: 14, fontWeight: '700', color: colors.ink },
  bubbleRow: { flexDirection: 'row' },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubbleRowTheirs: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '80%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMine: { backgroundColor: colors.brand },
  bubbleTheirs: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  bubbleTextMine: { color: '#fff', fontSize: 16, lineHeight: 22 },
  bubbleTextTheirs: { color: colors.ink, fontSize: 16, lineHeight: 22 },
});
