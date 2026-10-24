import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { imageSource } from '@/lib/api';
import { reasonText, type PickCard } from '@/lib/picks';
import { strings } from '@/lib/strings';
import { useCookie } from '@/lib/use-cookie';
import { colors } from './ui';

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

const styles = StyleSheet.create({
  photo: { width: '100%', aspectRatio: 4 / 5, borderRadius: 16, backgroundColor: colors.border },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { backgroundColor: '#d8f3ef', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  tagText: { fontSize: 14, fontWeight: '600', color: colors.ink },
  name: { fontSize: 24, fontWeight: '800', color: colors.ink },
  details: { fontSize: 16, color: colors.muted },
  second: { fontSize: 13, fontWeight: '800', color: colors.warn },
});
