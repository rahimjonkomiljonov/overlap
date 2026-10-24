import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const colors = {
  background: '#faf8f3',
  card: '#ffffff',
  border: '#e8e4da',
  ink: '#12202b',
  muted: '#5b6b78',
  brand: '#0a8a82',
  good: '#0a7a52',
  bad: '#b3261e',
  warn: '#8a5a00',
  warnBackground: '#fff1cf',
};

/** Page frame: safe area, scrolling, the brand wordmark on top. */
export function Screen({ children, onRefresh, refreshing }: { children: ReactNode; /** Pull down to refresh. */ onRefresh?: () => void; refreshing?: boolean }) {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.brand} colors={[colors.brand]} /> : undefined}
      >
        <Text style={styles.brand} accessibilityRole="header">
          overlap
        </Text>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Body({ children, tone }: { children: ReactNode; tone?: 'muted' | 'bad' | 'good' }) {
  return <Text style={[styles.body, tone === 'muted' && styles.muted, tone === 'bad' && styles.bad, tone === 'good' && styles.good]}>{children}</Text>;
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <View style={styles.notice}>
      <Text style={styles.noticeText}>{children}</Text>
    </View>
  );
}

/** 52 pt tall, above the 44 pt minimum for a comfortable tap. */
export function Button({ label, onPress, disabled, variant = 'solid' }: { label: string; onPress: () => void; disabled?: boolean; variant?: 'solid' | 'outline' | 'link' }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, variant === 'outline' && styles.outline, variant === 'link' && styles.link, disabled && styles.disabled]}
    >
      <Text style={[styles.buttonText, variant !== 'solid' && styles.buttonTextAlt]}>{label}</Text>
    </Pressable>
  );
}

export function Loading({ label }: { label: string }) {
  return (
    <View style={styles.center} accessibilityLabel={label}>
      <ActivityIndicator size="large" color={colors.brand} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 24, gap: 16 },
  brand: { fontFamily: 'serif', fontSize: 44, fontWeight: '800', color: colors.brand },
  card: { backgroundColor: colors.card, borderRadius: 20, padding: 20, gap: 12, borderWidth: 1, borderColor: colors.border },
  title: { fontSize: 24, fontWeight: '800', color: colors.ink },
  body: { fontSize: 16, lineHeight: 23, color: colors.ink },
  muted: { color: colors.muted },
  bad: { color: colors.bad, fontWeight: '600' },
  good: { color: colors.good, fontWeight: '700' },
  notice: { backgroundColor: colors.warnBackground, borderRadius: 14, padding: 14 },
  noticeText: { color: colors.warn, fontSize: 15, fontWeight: '600', lineHeight: 21 },
  button: { minHeight: 52, borderRadius: 26, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  outline: { backgroundColor: colors.card, borderWidth: 2, borderColor: colors.brand },
  link: { backgroundColor: 'transparent', minHeight: 44 },
  disabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  buttonTextAlt: { color: colors.brand },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
});
