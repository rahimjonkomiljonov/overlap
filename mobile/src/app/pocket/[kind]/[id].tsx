import { randomUUID } from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { Body, Button, Card, Loading, Screen, Title } from '@/components/ui';
import { useCookie } from '@/lib/use-cookie';
import { imageSource } from '@/lib/api';
import { fetchPocketDetail, pocketsProblemText, waveInPocket, type PocketDetail, type PocketKind, type PocketMember } from '@/lib/pockets';
import { strings } from '@/lib/strings';
import { useStyles, type Palette } from '@/lib/theme';

type State = { phase: 'loading' } | { phase: 'failed'; text: string } | { phase: 'ready'; data: PocketDetail };

function MemberPhoto({ url, label }: { url: string | null; label: string }) {
  const styles = useStyles(makeStyles);
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

function MemberRow({ kind, pocketId, member, onChanged }: { kind: PocketKind; pocketId: string; member: PocketMember; onChanged: (next: PocketMember) => void }) {
  const styles = useStyles(makeStyles);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justMatched, setJustMatched] = useState(false);
  // One key per member, kept until the wave settles, so a retry after a dropped connection is the same request.
  const key = useRef(randomUUID());

  async function onWave() {
    setBusy(true);
    setError(null);
    const result = await waveInPocket(kind, pocketId, member.userId, key.current);
    if (result.ok) {
      key.current = randomUUID();
      if (result.data.matched) setJustMatched(true);
      onChanged({ ...member, waved: true, matched: result.data.matched || member.matched });
    } else {
      setError(pocketsProblemText(result, strings.errorPocketSave));
    }
    setBusy(false);
  }

  const name = member.firstName ?? '?';
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <MemberPhoto url={member.photoUrl} label={name} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.name}>
            {name}
            {member.year !== null ? <Text style={styles.yearSuffix}>{`  ${strings.pocketYear(member.year)}`}</Text> : null}
          </Text>
          <Body tone="muted">
            {member.intents.join(' · ')}
            {member.alsoShared > 0 ? `  ·  ${strings.pocketAlsoShared(member.alsoShared)}` : ''}
          </Body>
          {error ? <Body tone="bad">{error}</Body> : null}
          {justMatched ? <Body tone="good">{strings.pocketMatchedNow}</Body> : null}
        </View>
        {member.matched ? (
          <Text style={styles.statusMatched}>{strings.pocketMatched}</Text>
        ) : member.waved ? (
          <Text style={styles.statusWaved}>{strings.pocketWaved}</Text>
        ) : (
          <Button label={busy ? strings.pocketWaving : strings.pocketWave} disabled={busy} onPress={() => void onWave()} />
        )}
      </View>
    </Card>
  );
}

/** One pocket in full: everyone the person could meet there, each with a plain profile-level wave. */
export default function PocketDetailScreen() {
  const styles = useStyles(makeStyles);
  const router = useRouter();
  const { kind, id } = useLocalSearchParams<{ kind: string; id: string }>();
  const pocketKind = kind === 'club' ? 'club' : 'course';
  const [state, setState] = useState<State>({ phase: 'loading' });

  const applyResult = useCallback((result: Awaited<ReturnType<typeof fetchPocketDetail>>) => {
    if (result.ok) setState({ phase: 'ready', data: result.data });
    else setState({ phase: 'failed', text: pocketsProblemText(result, strings.errorPocketsLoad) });
  }, []);

  // Fetches directly in the effect (never calling a function that could itself set state
  // synchronously), matching React's rule against synchronous setState from an effect.
  useEffect(() => {
    let active = true;
    fetchPocketDetail(pocketKind, String(id)).then((result) => {
      if (active) applyResult(result);
    });
    return () => {
      active = false;
    };
  }, [pocketKind, id, applyResult]);

  const reload = useCallback(() => {
    fetchPocketDetail(pocketKind, String(id)).then(applyResult);
  }, [pocketKind, id, applyResult]);

  function changeMember(userId: string, next: PocketMember) {
    setState((current) =>
      current.phase === 'ready' ? { phase: 'ready', data: { ...current.data, members: current.data.members.map((m) => (m.userId === userId ? next : m)) } } : current,
    );
  }

  if (state.phase === 'loading') return <Loading label={strings.loading} />;

  if (state.phase === 'failed') {
    return (
      <Screen>
        <Card>
          <Body tone="bad">{state.text}</Body>
          <Button label={strings.tryAgain} onPress={reload} />
          <Button label={strings.pocketBackToList} variant="outline" onPress={() => router.back()} />
        </Card>
      </Screen>
    );
  }

  const { data } = state;
  const canBrowse = data.verified && data.visible && data.hasPocketIntent;

  return (
    <Screen>
      <View style={{ gap: 4 }}>
        <Text style={styles.kindBadge}>{pocketKind === 'course' ? strings.pocketKindCourse : strings.pocketKindClub}</Text>
        <Title>{data.label}</Title>
      </View>

      {!canBrowse ? (
        <Card>
          <Body tone="muted">{strings.pocketsTurnOnToBrowse}</Body>
        </Card>
      ) : data.members.length === 0 ? (
        <Card>
          <Body tone="muted">{strings.pocketEmpty}</Body>
        </Card>
      ) : (
        <>
          <Body tone="muted">{strings.pocketHint}</Body>
          {data.members.map((member) => (
            <MemberRow key={member.userId} kind={pocketKind} pocketId={String(id)} member={member} onChanged={(next) => changeMember(member.userId, next)} />
          ))}
        </>
      )}

      <Button label={strings.pocketBackToList} variant="outline" onPress={() => router.back()} />
    </Screen>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  kindBadge: { fontSize: 12, fontWeight: '700', color: colors.brand, textTransform: 'uppercase' },
  name: { fontSize: 16, fontWeight: '700', color: colors.ink },
  yearSuffix: { fontSize: 12, fontWeight: '400', color: colors.muted },
  photo: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.border },
  photoFallback: { alignItems: 'center', justifyContent: 'center' },
  photoInitial: { fontSize: 18, fontWeight: '800', color: colors.muted },
  statusMatched: { fontSize: 13, fontWeight: '800', color: colors.good },
  statusWaved: { fontSize: 13, fontWeight: '700', color: colors.muted },
});
