import { useState } from 'react';
import { View } from 'react-native';

import { BasicsStep, IntentsStep, PicksStep } from '@/components/profile/basics-steps';
import type { StepProps } from '@/components/profile/common';
import { FreeTimeStep, InterestsStep, PromptsStep, ValuesStep } from '@/components/profile/more-steps';
import { PhotosStep } from '@/components/profile/photos-step';
import { PreviewStep } from '@/components/profile/preview-step';
import { Body, Button, Card, Loading, Screen, Title } from '@/components/ui';
import { useMe } from '@/lib/me';
import { useProfileData } from '@/lib/profile';
import { strings } from '@/lib/strings';

/** The wizard's steps in order. The server remembers the furthest one reached, so the wizard resumes there. */
const STEPS = ['basics', 'intents', 'courses', 'clubs', 'spots', 'freeTime', 'interests', 'prompts', 'values', 'photos', 'preview'] as const;

function StepBody({ step, ...props }: StepProps & { step: (typeof STEPS)[number] }) {
  switch (step) {
    case 'basics':
      return <BasicsStep {...props} />;
    case 'intents':
      return <IntentsStep {...props} />;
    case 'courses':
    case 'clubs':
    case 'spots':
      return <PicksStep what={step} {...props} />;
    case 'freeTime':
      return <FreeTimeStep {...props} />;
    case 'interests':
      return <InterestsStep {...props} />;
    case 'prompts':
      return <PromptsStep {...props} />;
    case 'values':
      return <ValuesStep {...props} />;
    case 'photos':
      return <PhotosStep {...props} />;
    case 'preview':
      return <PreviewStep {...props} />;
  }
}

/**
 * The profile wizard: the same eleven steps as the website, every answer saved by its own call as soon as
 * the person taps Next. Leaving and coming back resumes at the furthest step reached.
 */
export default function ProfileScreen() {
  const { refresh } = useMe();
  const { state, reloadProfile, retry } = useProfileData();
  const [index, setIndex] = useState<number | null>(null);

  if (state.phase === 'loading') return <Loading label={strings.loading} />;
  if (state.phase === 'failed') {
    return (
      <Screen>
        <Card>
          <Title>{strings.offlineTitle}</Title>
          <Body tone="muted">{strings.offlineBody}</Body>
          <Button label={strings.tryAgain} onPress={retry} />
        </Card>
      </Screen>
    );
  }

  const { profile, options } = state;
  const current = Math.min(index ?? state.startStep, STEPS.length - 1);
  const last = current === STEPS.length - 1;

  return (
    <Screen>
      <View style={{ gap: 4 }}>
        <Body tone="muted">{strings.profileStep(current + 1, STEPS.length)}</Body>
        <Body tone="muted">{strings.stepNames[current]}</Body>
      </View>
      {/* Keyed by step so every step starts from what the server holds, never from the previous step's typing. */}
      <StepBody key={STEPS[current]} step={STEPS[current]} profile={profile} options={options} reload={reloadProfile} onNext={() => (last ? refresh() : setIndex(current + 1))} />
      {current > 0 ? <Button label={strings.back} variant="link" onPress={() => setIndex(current - 1)} /> : null}
    </Screen>
  );
}
