import { Image } from 'expo-image';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { imageSource } from '@/lib/api';
import { reasonText, usePicks, type PickCard } from '@/lib/picks';
import { strings } from '@/lib/strings';
import { useCookie } from '@/lib/use-cookie';
import { Field } from './form';
import { Body, Button, colors } from './ui';

/** A person's picture. Held back until the session cookie has been read, because our own photo route needs it. */
export function PickPhoto({ url, label }: { url: string; label: string }) {
  const cookie = useCookie();
  if (cookie === null) return <View style={styles.photo} />;
  return <Image source={imageSource(url, cookie)} accessibilityLabel={label} contentFit="cover" style={styles.photo} />;
}

/** "Why you overlap" as short tags. */
export function ReasonTags({ card, limit }: { card: PickCard; limit?: number }) {
  const reasons = limit ? card.reasons.slice(0, limit) : card.reasons;
  return (
    <View style={styles.tags}>
      {reasons.map((reason, i) => (
        <View key={i} style={styles.tag}>
          <Text style={styles.tagText}>{reasonText(reason)}</Text>
        </View>
      ))}
    </View>
  );
}

/** "Mina" and "Year 2 · Design" under it. Either part may be missing. */
export function PickHeading({ card }: { card: PickCard }) {
  const details = [card.year == null ? null : strings.yearOfStudy(card.year), card.major].filter(Boolean).join(' · ');
  return (
    <View style={{ gap: 2 }}>
      <Text style={styles.name} accessibilityRole="header">
        {card.firstName ?? ''}
      </Text>
      {details ? <Text style={styles.details}>{details}</Text> : null}
      {card.secondChance ? <Text style={styles.second}>{strings.secondChance}</Text> : null}
    </View>
  );
}

/** The Wave button: tap to open a short optional note, then send. Shared by the list row and the detail screen. */
export function WaveComposer({ cardId, onSettled }: { cardId: string; onSettled?: () => void }) {
  const { wave } = usePicks();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    const result = await wave(cardId, note.trim() || undefined);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    // The card is already gone from the list by now (removed by the provider on any settled outcome);
    // an alert works regardless of whether this row is still mounted to show it in place.
    if (result.matched) Alert.alert(strings.waveMatchedNow);
    onSettled?.();
  }

  if (!open) {
    return <Button label={strings.wave} onPress={() => setOpen(true)} />;
  }
  return (
    <View style={{ gap: 8 }}>
      <Field label={strings.waveNotePlaceholder} value={note} onChangeText={(t) => setNote(t.slice(0, 140))} placeholder={strings.waveNotePlaceholder} maxLength={140} editable={!busy} />
      {error ? <Body tone="bad">{error}</Body> : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button label={strings.wavesCancel} variant="outline" disabled={busy} onPress={() => setOpen(false)} />
        <Button label={busy ? strings.waving : strings.wavesSend} disabled={busy} onPress={() => void send()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  photo: { width: '100%', aspectRatio: 4 / 5, borderRadius: 16, backgroundColor: colors.border },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { backgroundColor: '#d8f3ef', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  tagText: { fontSize: 14, fontWeight: '600', color: colors.ink },
  name: { fontSize: 24, fontWeight: '800', color: colors.ink },
  details: { fontSize: 16, color: colors.muted },
  second: { fontSize: 13, fontWeight: '800', color: colors.warn },
});
