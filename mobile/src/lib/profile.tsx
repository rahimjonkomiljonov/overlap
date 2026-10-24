import { useCallback, useEffect, useState } from 'react';

import { apiGet, type ApiResult } from './api';
import { strings } from './strings';

/** What GET /profile returns: the person's own answers and where they are in the wizard. */
export type Profile = {
  onboardingStep: number;
  completedAt: string | null;
  strength: number;
  firstName: string;
  gender: string | null;
  pronouns: string;
  year: number | null;
  major: string;
  interestedIn: string[];
  intents: string[];
  courses: { id: string; code: string; title: string }[];
  clubs: { id: string; name: string }[];
  spots: { id: string; name: string }[];
  freeTimeSlots: number[];
  interestTags: { id: string; labelKo: string; labelEn: string }[];
  freeText: string[];
  prompts: { promptId: string; textKo: string; textEn: string; answer: string }[];
  valuesAnswers: number[];
  photos: { id: string; url: string; sortOrder: number }[];
  missing: string[];
  datingStatus: 'available' | 'needs_consent' | 'cohort_closed';
};

/** What GET /profile/options returns: the lists and limits the screens are built from. */
export type Options = {
  limits: {
    courses: number;
    clubs: number;
    spots: number;
    interests: number;
    freeTextInterests: number;
    promptAnswerLength: number;
    requiredPrompts: number;
    valuesQuizLength: number;
    minPhotos: number;
    maxPhotos: number;
    maxFreeTimeSlot: number;
  };
  genders: string[];
  studyYears: number[];
  majorGroups: { college: { ko: string; en: string }; majors: { ko: string; en: string }[] }[];
  valuesQuiz: { key: string; textKo: string; textEn: string }[];
  prompts: { id: string; textKo: string; textEn: string }[];
  interests: { id: string; labelKo: string; labelEn: string }[];
};

type Loaded = { profile: Profile; options: Options };
/** `startStep` is where the server said they were when the wizard opened. It never changes while the wizard is open: saving moves the server's counter, but the screen only moves when the person does. */
type State = { phase: 'loading' } | { phase: 'failed' } | ({ phase: 'ready'; startStep: number } & Loaded);

/** Loads the profile and the lists the wizard needs, and reloads the profile after every save. */
export function useProfileData() {
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([apiGet<Profile>('/profile'), apiGet<Options>('/profile/options')]).then(([profile, options]) => {
      if (!active) return;
      if (profile.ok && options.ok) setState({ phase: 'ready', startStep: profile.data.onboardingStep, profile: profile.data, options: options.data });
      else setState({ phase: 'failed' });
    });
    return () => {
      active = false;
    };
  }, [attempt]);

  /** Fetches the profile again without flashing the loading screen, so what was typed stays on screen. */
  const reloadProfile = useCallback(async () => {
    const profile = await apiGet<Profile>('/profile');
    if (profile.ok) setState((current) => (current.phase === 'ready' ? { ...current, profile: profile.data } : current));
    return profile.ok;
  }, []);

  const retry = useCallback(() => {
    setState({ phase: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  return { state, reloadProfile, retry };
}

/** What a failed save, upload or delete means to a person. */
export function problemText(result: Extract<ApiResult<unknown>, { ok: false }>): string {
  if (result.code === 'NETWORK') return strings.offlineBody;
  if (result.code === 'RATE_LIMITED') return strings.errorTooManyRequests;
  if (result.code === 'RULE_VIOLATION' && result.reason) return strings.profileReasons[result.reason] ?? strings.errorProfileSave;
  if (result.code === 'INVALID_INPUT') return strings.errorCheckInput;
  return strings.errorProfileSave;
}
