import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Body, Button, Card, Loading, Screen, Title, colors } from '@/components/ui';
import { fetchMyPockets, pocketsProblemText, setPocketsVisible, type MyPockets } from '@/lib/pockets';
import { strings } from '@/lib/strings';

type State = { phase: 'loading' } | { phase: 'failed'; text: string } | { phase: 'ready'; data: MyPockets };

/** C7's opt-in switch: off by default, and only a visible, verified person with a pocket intent can browse. */
function VisibilityToggle({ data, onChanged }: { data: MyPockets; onChanged: (next: MyPockets) => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setPending(true);
    setError(null);
    const result = await setPocketsVisible(!data.visible);
    if (result.ok) onChanged({ ...data, visible: result.data.visible });
    else setError(pocketsProblemText(result, strings.errorPocketSave));
    setPending(false);
  }

  const notice = !data.verified
    ? strings.pocketsVerifyFirst
    : !data.hasPocketIntent
      ? strings.pocketsNeedsIntent
      : !data.visible
        ? strings.pocketsTurnOnToBrowse
        : null;

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.toggleLabel}>{strings.pocketsVisibleLabel}</Text>
          <Body tone="muted">{strings.pocketsVisibleHint}</Body>
        </View>
        <Button label={data.visible ? strings.pocketsTurnOff : strings.pocketsTurnOn} variant={data.visible ? 'outline' : 'solid'} disabled={pending} onPress={() => void toggle()} />
      </View>
      {notice ? <Body tone="muted">{notice}</Body> : null}
      {error ? <Body tone="bad">{error}</Body> : null}
    </Card>
  );
}

/** Your own courses and clubs: everyone who could meet you there, as a plain list (no algorithm). */
export default function PocketsScreen() {
  const router = useRouter();
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    const result = await fetchMyPockets();
    if (result.ok) setState({ phase: 'ready', data: result.data });
    else setState({ phase: 'failed', text: pocketsProblemText(result, strings.errorPocketsLoad) });
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.phase === 'loading') return <Loading label={strings.loading} />;

  return (
    <Screen onRefresh={() => void load(true)} refreshing={refreshing}>
      <View style={{ gap: 4 }}>
        <Title>{strings.pocketsTitle}</Title>
        <Body tone="muted">{strings.pocketsIntro}</Body>
      </View>

      {state.phase === 'failed' ? (
        <Card>
          <Body tone="bad">{state.text}</Body>
          <Button label={strings.tryAgain} onPress={() => void load()} />
        </Card>
      ) : (
        <>
          <VisibilityToggle data={state.data} onChanged={(next) => setState({ phase: 'ready', data: next })} />

          {state.data.pockets.length === 0 ? (
            <Card>
              <Title>{strings.pocketsEmptyTitle}</Title>
              <Body tone="muted">{strings.pocketsEmptyBody}</Body>
            </Card>
          ) : (
            state.data.pockets.map((pocket) => (
              <Pressable
                key={`${pocket.kind}:${pocket.id}`}
                accessibilityRole="button"
                accessibilityLabel={pocket.label}
                onPress={() => router.push({ pathname: '/pocket/[kind]/[id]', params: { kind: pocket.kind, id: pocket.id } })}
              >
                <Card>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.kindBadge}>{pocket.kind === 'course' ? strings.pocketKindCourse : strings.pocketKindClub}</Text>
                      <Text style={styles.pocketLabel} numberOfLines={1}>
                        {pocket.label}
                      </Text>
                    </View>
                    <Body tone="muted">{strings.pocketMemberCount(pocket.memberCount)}</Body>
                  </View>
                </Card>
              </Pressable>
            ))
          )}
        </>
      )}

      <Button label={strings.back} variant="outline" onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  toggleLabel: { fontSize: 16, fontWeight: '700', color: colors.ink },
  kindBadge: { fontSize: 12, fontWeight: '700', color: colors.brand, textTransform: 'uppercase' },
  pocketLabel: { fontSize: 16, fontWeight: '700', color: colors.ink },
});
