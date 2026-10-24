import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useState } from 'react';

import { Body, Button, Card, Loading, Notice, Screen, Title } from '@/components/ui';
import { apiGet, apiUpload } from '@/lib/api';
import { SELFIE_MAX_SIDE, shrinkImage } from '@/lib/image';
import { problemText } from '@/lib/profile';
import { strings } from '@/lib/strings';

type Status = { state: 'unsubmitted' | 'pending' | 'verified' } | { state: 'rejected'; reason: string | null };

/**
 * Selfie verification: a live photo from the front camera (no library, so it cannot be an old picture), shown
 * only to the reviewing moderator. The screen only ever shows the status; there is no route that returns the selfie.
 */
export default function VerifyScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await apiGet<Status>('/verification');
    if (result.ok) setStatus(result.data);
    else setError(problemText(result));
  }, []);

  useEffect(() => {
    let active = true;
    apiGet<Status>('/verification').then((result) => {
      if (!active) return;
      if (result.ok) setStatus(result.data);
      else setError(problemText(result));
    });
    return () => {
      active = false;
    };
  }, []);

  async function takeSelfie() {
    setError(null);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError(strings.cameraDenied);
      return;
    }
    const picked = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], cameraType: ImagePicker.CameraType.front, quality: 1 });
    if (picked.canceled) return;
    setBusy(true);
    const asset = picked.assets[0];
    const file = await shrinkImage({ uri: asset.uri, width: asset.width, height: asset.height }, SELFIE_MAX_SIDE, 'selfie.jpg');
    const result = await apiUpload('/verification/selfie', 'selfie', file);
    if (!result.ok) {
      setError(result.code === 'RULE_VIOLATION' && result.reason === 'ALREADY_PENDING' ? strings.verifyAlreadyPending : problemText(result));
    }
    await load();
    setBusy(false);
  }

  if (!status && !error) return <Loading label={strings.loading} />;

  const canSubmit = status !== null && (status.state === 'unsubmitted' || status.state === 'rejected');
  return (
    <Screen>
      <Card>
        <Title>{strings.verifyTitle}</Title>
        <Body tone="muted">{strings.verifyBody}</Body>
        {status?.state === 'unsubmitted' ? <Body>{strings.verifyUnsubmitted}</Body> : null}
        {status?.state === 'pending' ? <Notice>{strings.verifyPending}</Notice> : null}
        {status?.state === 'verified' ? <Body tone="good">{strings.verifyVerified}</Body> : null}
        {status?.state === 'rejected' ? <Body tone="bad">{strings.verifyRejected(status.reason)}</Body> : null}
        {error ? <Body tone="bad">{error}</Body> : null}
        {canSubmit ? <Button label={busy ? strings.uploading : strings.takeSelfie} disabled={busy} onPress={() => void takeSelfie()} /> : null}
        <Button label={strings.backToHome} variant="outline" onPress={() => router.back()} />
      </Card>
    </Screen>
  );
}
