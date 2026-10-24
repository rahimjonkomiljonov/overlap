import { useState } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Body, colors, Title } from '@/components/ui';
import { apiPost, imageSource } from '@/lib/api';
import { problemText } from '@/lib/profile';
import { strings } from '@/lib/strings';
import { StepFooter, useCookie, type StepProps } from './common';

type FinishResult = { status: 'complete' } | { status: 'incomplete'; missing: string[] };

/** The last step: how others will see the profile, what is still missing, and the Finish button. */
export function PreviewStep({ profile, options, reload, onNext }: StepProps) {
  const cookie = useCookie();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[]>(profile.missing);
  const first = [...profile.photos].sort((a, b) => a.sortOrder - b.sortOrder)[0];
  const maxYear = Math.max(...options.studyYears);

  async function finish() {
    setBusy(true);
    setError(null);
    const result = await apiPost<FinishResult>('/profile/finish', {});
    if (!result.ok) {
      setBusy(false);
      setError(problemText(result));
      return;
    }
    if (result.data.status === 'incomplete') {
      setMissing(result.data.missing);
      setBusy(false);
      return;
    }
    // The app's home appears as soon as the server says the profile is complete.
    await reload();
    setBusy(false);
    onNext();
  }

  const lines: [string, string][] = [
    [strings.previewField.name, profile.firstName],
    [strings.previewField.major, profile.major],
    [strings.previewField.year, profile.year === null ? '' : strings.yearName(profile.year, maxYear)],
    [strings.previewField.intents, profile.intents.map((i) => strings.intentNames[i] ?? i).join(', ')],
    [strings.previewField.interests, [...profile.interestTags.map((t) => t.labelEn), ...profile.freeText].join(', ')],
    [strings.previewField.courses, profile.courses.map((c) => `${c.code} ${c.title}`).join(', ')],
    [strings.previewField.clubs, profile.clubs.map((c) => c.name).join(', ')],
  ];

  return (
    <View style={{ gap: 14 }}>
      <Title>{strings.previewTitle}</Title>
      {first && cookie !== null ? <Image source={imageSource(first.url, cookie)} style={styles.photo} accessibilityLabel={strings.photoFor(1)} contentFit="cover" /> : null}
      {lines
        .filter(([, value]) => value)
        .map(([label, value]) => (
          <View key={label}>
            <Body tone="muted">{label}</Body>
            <Body>{value}</Body>
          </View>
        ))}
      <Body>{strings.strength(profile.strength)}</Body>
      {missing.length > 0 ? (
        <View style={{ gap: 4 }}>
          <Body tone="bad">{strings.missingTitle}</Body>
          {missing.map((key) => (
            <Body key={key}>• {strings.missingNames[key] ?? key}</Body>
          ))}
        </View>
      ) : null}
      <StepFooter busy={busy} error={error} nextLabel={strings.finishProfile} onNext={() => void finish()} />
    </View>
  );
}

const styles = StyleSheet.create({
  photo: { width: '100%', aspectRatio: 3 / 4, borderRadius: 16, backgroundColor: colors.border },
});
