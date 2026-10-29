import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Body } from '@/components/ui';
import { apiGet } from '@/lib/api';
import { localized } from '@/lib/locale';
import { strings } from '@/lib/strings';
import { useColors, useStyles, type Palette } from '@/lib/theme';

export type PickKind = 'course' | 'club' | 'spot';
export type Pick = { id: string; label: string };

type RawResult = { id: string; code?: string; title?: string; titleEn?: string | null; name?: string; nameEn?: string | null };

/** One search result as a line of text, in the language in use (English names where there are any, Korean otherwise). */
function labelOf(kind: PickKind, r: RawResult): string {
  if (kind === 'course') return `${r.code ?? ''} ${localized(r.title, r.titleEn)}`.trim();
  return localized(r.name, r.nameEn);
}

/**
 * Search-as-you-type for courses, clubs and spots on the person's own campus (the server decides
 * the campus). An empty box suggests the first few, so there is something to tap straight away.
 * What is chosen is kept as a list with a remove button, up to `max`.
 */
export function SearchPicker({ kind, max, picks, onChange }: { kind: PickKind; max: number; picks: Pick[]; onChange: (next: Pick[]) => void }) {
  const styles = useStyles(makeStyles);
  const colors = useColors();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Pick[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    let active = true;
    const handle = setTimeout(async () => {
      setSearching(true);
      const result = await apiGet<{ results: RawResult[] }>(`/reference/search?type=${kind}&q=${encodeURIComponent(query.trim())}`);
      if (!active) return;
      setSearching(false);
      setResults(result.ok ? result.data.results.map((r) => ({ id: r.id, label: labelOf(kind, r) })) : []);
    }, query ? 300 : 0);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [kind, query]);

  const chosen = new Set(picks.map((p) => p.id));
  const full = picks.length >= max;
  const available = results.filter((r) => !chosen.has(r.id));

  return (
    <View style={styles.wrap}>
      {picks.length === 0 ? <Body tone="muted">{strings.nothingAdded}</Body> : null}
      {picks.map((pick) => (
        <View key={pick.id} style={styles.selected}>
          <Text style={styles.selectedText}>{pick.label}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`${strings.remove} ${pick.label}`} onPress={() => onChange(picks.filter((p) => p.id !== pick.id))} style={styles.remove}>
            <Text style={styles.removeText}>{strings.remove}</Text>
          </Pressable>
        </View>
      ))}
      <TextInput
        testID="search-input"
        style={styles.input}
        value={query}
        onChangeText={setQuery}
        placeholder={strings.searchPlaceholder}
        placeholderTextColor={colors.muted}
        accessibilityLabel={strings.searchPlaceholder}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {full ? <Body tone="muted">{strings.maxReached(max)}</Body> : null}
      {!full && searching && available.length === 0 ? <Body tone="muted">{strings.loading}</Body> : null}
      {!full
        ? available.map((r) => (
            <Pressable key={r.id} accessibilityRole="button" accessibilityLabel={`${strings.add} ${r.label}`} onPress={() => onChange([...picks, r])} style={styles.result}>
              <Text style={styles.resultText}>{r.label}</Text>
              <Text style={styles.add}>{strings.add}</Text>
            </Pressable>
          ))
        : null}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  wrap: { gap: 8 },
  selected: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.tag, borderRadius: 14, paddingLeft: 14, minHeight: 48 },
  selectedText: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.ink },
  remove: { minHeight: 48, paddingHorizontal: 14, justifyContent: 'center' },
  removeText: { color: colors.bad, fontWeight: '700', fontSize: 14 },
  input: { fontSize: 18, minHeight: 52, borderRadius: 14, borderWidth: 1, borderColor: colors.inputBorder, paddingHorizontal: 14, color: colors.ink, backgroundColor: colors.onBrand },
  result: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.onBrand },
  resultText: { flex: 1, fontSize: 15, color: colors.ink },
  add: { color: colors.brand, fontWeight: '800', fontSize: 14 },
});
