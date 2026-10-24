import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Body, Button, colors } from '@/components/ui';
import { apiPut } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { problemText, type Options, type Profile } from '@/lib/profile';
import { strings } from '@/lib/strings';

/** What every wizard step receives. */
export type StepProps = {
  profile: Profile;
  options: Options;
  /** Reads the profile again after a change, so the screen shows what the server now has. */
  reload: () => Promise<boolean>;
  /** Moves to the next step. */
  onNext: () => void;
};

/**
 * Saves one step (`PUT /profile/<route>`), reads the profile again and moves on. Shows the server's
 * reason in plain words when it refuses.
 */
export function useStepSave(route: string, props: Pick<StepProps, 'reload' | 'onNext'>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = useCallback(
    async (body: unknown) => {
      setBusy(true);
      setError(null);
      const result = await apiPut(`/profile/${route}`, body);
      if (!result.ok) {
        setBusy(false);
        setError(problemText(result));
        return;
      }
      await props.reload();
      setBusy(false);
      props.onNext();
    },
    [route, props],
  );
  return { save, busy, error };
}

/**
 * The session cookie, for loading pictures that live on our own server. `null` until it has been read: a picture
 * must not be requested before then, because the phone remembers a failed picture by its address and would not retry
 * it once the cookie arrives.
 */
export function useCookie(): string | null {
  const [cookie, setCookie] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    Promise.resolve(authClient.getCookie()).then((value) => active && setCookie(value));
    return () => {
      active = false;
    };
  }, []);
  return cookie;
}

/** A choice you can tap on and off. 44 pt tall. */
export function Chip({ label, selected, onPress, disabled, radio }: { label: string; selected: boolean; onPress: () => void; disabled?: boolean; radio?: boolean }) {
  return (
    <Pressable
      accessibilityRole={radio ? 'radio' : 'checkbox'}
      accessibilityState={{ checked: selected, disabled: !!disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipOn, disabled && styles.chipDisabled]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.chipRow}>{children}</View>;
}

/** A line of text that opens a full-screen list: for the department, year and prompt choices. */
export type PickerSection = { title?: string; data: { value: string; label: string }[] };

export function PickerField({ label, value, placeholder, sections, onSelect }: { label: string; value: string | null; placeholder?: string; sections: PickerSection[]; onSelect: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const shown = sections.flatMap((s) => s.data).find((item) => item.value === value)?.label;
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => setOpen(true)} style={styles.fieldBox}>
        <Text style={[styles.fieldText, !shown && styles.placeholder]}>{shown ?? placeholder ?? strings.choose}</Text>
      </Pressable>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={styles.modal}>
          <Text style={styles.modalTitle}>{label}</Text>
          <SectionList
            sections={sections.map((s) => ({ ...s, title: s.title ?? '' }))}
            keyExtractor={(item) => item.value}
            renderSectionHeader={({ section }) => (section.title ? <Text style={styles.sectionTitle}>{section.title}</Text> : null)}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  onSelect(item.value);
                  setOpen(false);
                }}
                style={[styles.row, item.value === value && styles.rowOn]}
              >
                <Text style={styles.rowText}>{item.label}</Text>
              </Pressable>
            )}
            keyboardShouldPersistTaps="handled"
          />
          <View style={styles.modalClose}>
            <Button label={strings.done} variant="outline" onPress={() => setOpen(false)} />
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

/** Next, Skip and the error line every step ends with. */
export function StepFooter({ onNext, nextLabel, disabled, busy, error, onSkip }: { onNext: () => void; nextLabel?: string; disabled?: boolean; busy?: boolean; error?: string | null; onSkip?: () => void }) {
  return (
    <View style={styles.footer}>
      {error ? <Body tone="bad">{error}</Body> : null}
      <Button label={busy ? strings.saving : (nextLabel ?? strings.next)} disabled={disabled || busy} onPress={onNext} />
      {onSkip ? <Button label={strings.skip} variant="link" disabled={busy} onPress={onSkip} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { minHeight: 44, borderRadius: 22, borderWidth: 1.5, borderColor: '#cfd6dc', paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipDisabled: { opacity: 0.45 },
  chipText: { fontSize: 15, fontWeight: '600', color: colors.ink },
  chipTextOn: { color: '#fff' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: '700', color: colors.muted },
  fieldBox: { minHeight: 52, borderRadius: 14, borderWidth: 1, borderColor: '#cfd6dc', paddingHorizontal: 14, justifyContent: 'center', backgroundColor: '#fff' },
  fieldText: { fontSize: 18, color: colors.ink },
  placeholder: { color: colors.muted },
  modal: { flex: 1, backgroundColor: colors.background, padding: 20 },
  modalTitle: { fontSize: 22, fontWeight: '800', color: colors.ink, marginBottom: 12 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: colors.brand, marginTop: 16, marginBottom: 4, textTransform: 'uppercase' },
  row: { minHeight: 52, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12 },
  rowOn: { backgroundColor: '#d8f3ef' },
  rowText: { fontSize: 17, color: colors.ink },
  modalClose: { paddingTop: 12 },
  footer: { gap: 8, marginTop: 8 },
});
