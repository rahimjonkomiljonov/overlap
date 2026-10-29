import * as Haptics from 'expo-haptics';

/** Small physical feedback. It never throws: a phone without a vibration motor just does nothing. */
const quiet = () => undefined;

/** A light tap, for pressing a button or switching tab. */
export const tapFeedback = () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(quiet);

/** A short "it worked" pattern, for a wave sent or a match made. */
export const successFeedback = () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(quiet);
