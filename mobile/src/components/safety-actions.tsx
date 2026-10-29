import { randomUUID } from 'expo-crypto';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Chip, Field } from '@/components/form';
import { Body, Button } from '@/components/ui';
import type { ApiResult } from '@/lib/api';
import { blockUser, fileReport, REPORT_CATEGORIES, type ReportCategory } from '@/lib/safety';
import { strings } from '@/lib/strings';
import { useStyles, type Palette } from '@/lib/theme';

type Mode = 'idle' | 'report' | 'block' | 'reported';

function problemText(result: Extract<ApiResult<unknown>, { ok: false }>): string {
  if (result.code === 'NETWORK') return strings.offlineBody;
  if (result.code === 'RATE_LIMITED') return strings.errorTooManyRequests;
  if (result.code === 'RULE_VIOLATION' && result.reason && strings.safetyErrors[result.reason]) return strings.safetyErrors[result.reason];
  if (result.code === 'NOT_FOUND') return strings.safetyErrors.NOT_FOUND;
  return strings.safetyErrorSave;
}

/**
 * The two ways to act on someone who is bothering you, from a chat or a match: report (they are hidden
 * from you at once; from a chat the last messages go along as evidence) and block (mutual invisibility,
 * with a confirm step, never a destructive one-tap button).
 */
export function SafetyActions({ targetUserId, conversationId, onBlocked }: { targetUserId: string; conversationId?: string; onBlocked: () => void }) {
  const styles = useStyles(makeStyles);
  const [mode, setMode] = useState<Mode>('idle');
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef(randomUUID());

  function close() {
    setMode('idle');
    setError(null);
  }

  async function onReport() {
    if (!category) return;
    setBusy(true);
    setError(null);
    const result = await fileReport(key.current, { targetUserId, category, description: description.trim() || undefined, conversationId });
    setBusy(false);
    if (result.ok) {
      key.current = randomUUID();
      setMode('reported');
      return;
    }
    setError(problemText(result));
  }

  async function onBlock() {
    setBusy(true);
    setError(null);
    const result = await blockUser(targetUserId);
    setBusy(false);
    if (result.ok) {
      onBlocked();
      return;
    }
    setError(problemText(result));
  }

  if (mode === 'reported') return <Body tone="good">{strings.reportThanks}</Body>;

  if (mode === 'report') {
    return (
      <View style={styles.panel}>
        <Body>{strings.reportTitle}</Body>
        <View style={styles.chipRow}>
          {REPORT_CATEGORIES.map((c) => (
            <Chip key={c} label={strings.reportCategories[c]} selected={category === c} onPress={() => setCategory(c)} />
          ))}
        </View>
        <Field label={strings.reportDescriptionPlaceholder} value={description} onChangeText={(t) => setDescription(t.slice(0, 500))} placeholder={strings.reportDescriptionPlaceholder} editable={!busy} multiline />
        {error ? <Body tone="bad">{error}</Body> : null}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button label={strings.reportCancel} variant="outline" disabled={busy} onPress={close} />
          <Button label={busy ? strings.reportSending : strings.reportSubmit} disabled={busy || !category} onPress={() => void onReport()} />
        </View>
      </View>
    );
  }

  if (mode === 'block') {
    return (
      <View style={styles.panel}>
        <Body>{strings.blockConfirm}</Body>
        {error ? <Body tone="bad">{error}</Body> : null}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button label={strings.reportCancel} variant="outline" disabled={busy} onPress={close} />
          <Button label={busy ? strings.blockBlocking : strings.blockConfirmButton} disabled={busy} onPress={() => void onBlock()} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Button label={strings.reportButton} variant="outline" onPress={() => setMode('report')} />
      <Button label={strings.blockButton} variant="outline" onPress={() => setMode('block')} />
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  panel: { gap: 10, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
