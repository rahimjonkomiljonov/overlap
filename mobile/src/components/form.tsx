import { Pressable, StyleSheet, Switch, Text, TextInput, View, type TextInputProps } from 'react-native';

import { colors } from './ui';

/** A tick box with its words next to it. The whole row is the tap target (taller than 44 pt). */
export function CheckRow({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={label} onPress={() => onChange(!checked)} style={styles.row}>
      <View style={[styles.box, checked && styles.boxChecked]}>{checked ? <Text style={styles.tick}>✓</Text> : null}</View>
      <Text style={styles.rowText}>{label}</Text>
    </Pressable>
  );
}

/** An on/off switch with its words next to it, off until the person turns it on. */
export function SwitchRow({ value, onChange, label }: { value: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <View style={styles.row}>
      <Switch accessibilityLabel={label} value={value} onValueChange={onChange} trackColor={{ true: colors.brand, false: '#cfd6dc' }} />
      <Text style={styles.rowText} onPress={() => onChange(!value)}>
        {label}
      </Text>
    </View>
  );
}

/** A selectable pill: one choice out of several (a day, a time, a place). 48 pt tall, above the 44 pt minimum. */
export function Chip({ label, selected, disabled, onPress }: { label: string; selected: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected, disabled && styles.chipDisabled]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

/** A labelled text box. 18 pt text, so phones do not zoom in on it. */
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholderTextColor={colors.muted} style={styles.input} {...props} />
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { minHeight: 48, borderRadius: 24, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: 16, justifyContent: 'center' },
  chipSelected: { borderColor: colors.brand, backgroundColor: '#e3f4f2' },
  chipDisabled: { opacity: 0.4 },
  chipText: { fontSize: 15, fontWeight: '600', color: colors.ink },
  chipTextSelected: { color: colors.brand },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, paddingVertical: 6 },
  rowText: { flex: 1, fontSize: 16, lineHeight: 22, color: colors.ink },
  box: { width: 28, height: 28, borderRadius: 8, borderWidth: 2, borderColor: colors.brand, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  boxChecked: { backgroundColor: colors.brand },
  tick: { color: '#fff', fontSize: 18, fontWeight: '800', lineHeight: 22 },
  field: { gap: 6, flex: 1 },
  label: { fontSize: 13, fontWeight: '700', color: colors.muted },
  input: { fontSize: 18, minHeight: 52, borderRadius: 14, borderWidth: 1, borderColor: '#cfd6dc', paddingHorizontal: 14, color: colors.ink, backgroundColor: '#fff' },
});
