import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Body, Button, colors, Title } from '@/components/ui';
import { apiDelete, apiUpload, imageSource } from '@/lib/api';
import { PHOTO_MAX_SIDE, shrinkImage } from '@/lib/image';
import { problemText } from '@/lib/profile';
import { strings } from '@/lib/strings';
import { StepFooter, useCookie, type StepProps } from './common';

/**
 * Three to six photos. Each one is shrunk on the phone first (a camera picture can be 10 MB, the server takes
 * 4 MB), then uploaded on its own, so one bad picture never loses the others. The list shown is always what
 * the server has, read again after every change.
 */
export function PhotosStep({ profile, options, reload, onNext }: StepProps) {
  const cookie = useCookie();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { minPhotos, maxPhotos } = options.limits;
  const photos = [...profile.photos].sort((a, b) => a.sortOrder - b.sortOrder);
  const full = photos.length >= maxPhotos;

  async function upload(picked: ImagePicker.ImagePickerAsset[]) {
    setBusy(true);
    setError(null);
    for (const asset of picked.slice(0, maxPhotos - photos.length)) {
      const file = await shrinkImage({ uri: asset.uri, width: asset.width, height: asset.height }, PHOTO_MAX_SIDE, `photo-${Date.now()}.jpg`);
      const result = await apiUpload('/profile/photos', 'photo', file);
      if (!result.ok) {
        setError(problemText(result));
        break;
      }
    }
    await reload();
    setBusy(false);
  }

  async function fromLibrary() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: maxPhotos - photos.length, quality: 1 });
    if (!result.canceled) await upload(result.assets);
  }

  async function fromCamera() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError(strings.cameraDenied);
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
    if (!result.canceled) await upload(result.assets);
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    const result = await apiDelete(`/profile/photos/${id}`);
    if (!result.ok) setError(problemText(result));
    await reload();
    setBusy(false);
  }

  return (
    <View style={{ gap: 14 }}>
      <Title>{strings.photosTitle}</Title>
      <Body tone="muted">{strings.photosHint(minPhotos, maxPhotos)}</Body>
      <View style={styles.grid}>
        {photos.map((photo, i) => (
          <View key={photo.id} style={styles.cell}>
            {cookie !== null ? <Image source={imageSource(photo.url, cookie)} style={styles.image} accessibilityLabel={strings.photoFor(i + 1)} contentFit="cover" /> : <View style={styles.image} />}
            <Pressable accessibilityRole="button" accessibilityLabel={`${strings.remove} ${strings.photoFor(i + 1)}`} disabled={busy} onPress={() => void remove(photo.id)} style={styles.remove}>
              <Text style={styles.removeText}>{strings.remove}</Text>
            </Pressable>
          </View>
        ))}
      </View>
      <Body tone="muted">{strings.photosCount(photos.length, maxPhotos)}</Body>
      {busy ? <Body tone="muted">{strings.uploading}</Body> : null}
      <Button label={strings.fromLibrary} variant="outline" disabled={busy || full} onPress={() => void fromLibrary()} />
      <Button label={strings.takePhoto} variant="outline" disabled={busy || full} onPress={() => void fromCamera()} />
      <StepFooter busy={false} error={error} disabled={busy || photos.length < minPhotos} onNext={onNext} />
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell: { width: '31%', gap: 4 },
  image: { width: '100%', aspectRatio: 3 / 4, borderRadius: 12, backgroundColor: colors.border },
  remove: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  removeText: { color: colors.bad, fontWeight: '700', fontSize: 14 },
});
