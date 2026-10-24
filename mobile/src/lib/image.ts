import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import type { UploadFile } from './api';

/** The longest side a profile photo needs. The server stores at most this too. */
export const PHOTO_MAX_SIDE = 1600;
/** A selfie is only looked at by a moderator, so it can be smaller. */
export const SELFIE_MAX_SIDE = 1280;

/**
 * Shrinks a picture on the phone before it is uploaded. A phone camera makes 3 to 10 MB pictures, but the
 * server accepts at most 4 MB (the hosting platform refuses anything over 4.5 MB before our code runs), and a
 * 1600 pixel JPEG is well under 1 MB. The picture is re-saved as JPEG, which also drops its location data.
 *
 * `width` and `height` come from the picker, so only the longer side is limited and the shape is kept.
 */
export async function shrinkImage(source: { uri: string; width: number; height: number }, maxSide: number, name: string): Promise<UploadFile> {
  const context = ImageManipulator.manipulate(source.uri);
  const longest = Math.max(source.width, source.height);
  if (longest > maxSide) {
    context.resize(source.width >= source.height ? { width: maxSide } : { height: maxSide });
  }
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  return { uri: saved.uri, name, type: 'image/jpeg' };
}
