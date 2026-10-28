import { randomUUID } from 'expo-crypto';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { apiGet, apiPostOnce, type ApiErrorCode, type ApiResult } from './api';
import { strings } from './strings';

/** The language the server writes reason labels and prompt questions in. Korean comes with M15. */
const APP_LOCALE = 'en';

/** "Why you overlap", in the website's own encoding: a named course, club or interest, a shared free time, or similar values. */
export type Reason =
  | { type: 'course' | 'club' | 'interest'; label: string }
  | { type: 'freeTime'; day: number; block: number }
  | { type: 'values' };

/** One person to look at: everything the detail screen shows. `id` is the pick's own id, used to act on it. */
export type PickCard = {
  id: string;
  firstName: string | null;
  year: number | null;
  major: string | null;
  photos: { id: string; url: string }[];
  prompts: { id: string; question: string; answer: string }[];
  reasons: Reason[];
  /** The person was passed once before; this is their one return. */
  secondChance: boolean;
};

export type IntentPicks = { intent: string; items: PickCard[] };

type State = { phase: 'loading' } | { phase: 'failed'; code: ApiErrorCode; reason?: string } | { phase: 'ready'; intents: IntentPicks[] };

export type WaveOutcome = { ok: true; matched: boolean } | { ok: false; error: string };

type PicksValue = {
  state: State;
  /** True while a pull-to-refresh is in flight (the list stays on screen meanwhile). */
  refreshing: boolean;
  reload: () => void;
  /** Passes on a pick. Returns null on success (the card is gone from the list) or the words to show on failure. */
  pass: (id: string) => Promise<string | null>;
  /** Waves on a pick, with an optional note. The card leaves the list on success either way; `matched` says whether it formed a match right away. */
  wave: (id: string, note?: string) => Promise<WaveOutcome>;
  find: (id: string) => PickCard | undefined;
};

const PicksContext = createContext<PicksValue | null>(null);

/** What a failed pick request means to a person. */
export function picksProblemText(result: Extract<ApiResult<unknown>, { ok: false }>, fallback: string): string {
  if (result.code === 'NETWORK') return strings.offlineBody;
  if (result.code === 'RATE_LIMITED') return strings.errorTooManyRequests;
  if (result.code === 'RULE_VIOLATION' && result.reason === 'PROFILE_INCOMPLETE') return strings.profileIncomplete;
  return fallback;
}

/** One line for a reason: the website's wording, in the app's words. */
export function reasonText(reason: Reason): string {
  switch (reason.type) {
    case 'course':
    case 'club':
    case 'interest':
      return reason.label;
    case 'freeTime':
      return strings.reasonFreeTime(strings.days[reason.day] ?? '', strings.blocks[reason.block] ?? '');
    case 'values':
      return strings.reasonValues;
  }
}

/**
 * Loads today's picks once there is a finished profile, and keeps them while the person moves between the list and a
 * detail screen. Mount it keyed by the person so a different account never inherits the previous one's picks.
 */
export function PicksProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  // One key per pass/wave, kept until it settles, so a retry after a dropped connection is the same request.
  const keys = useRef(new Map<string, string>());
  const waveKeys = useRef(new Map<string, string>());

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    apiGet<{ intents: IntentPicks[] }>(`/picks?locale=${APP_LOCALE}`).then((result) => {
      if (!active) return;
      setRefreshing(false);
      if (result.ok) setState({ phase: 'ready', intents: result.data.intents });
      else setState((current) => (current.phase === 'ready' ? current : { phase: 'failed', code: result.code, reason: result.reason }));
    });
    return () => {
      active = false;
    };
  }, [enabled, attempt]);

  const reload = useCallback(() => {
    setRefreshing(true);
    setAttempt((n) => n + 1);
  }, []);

  const removeLocally = useCallback((id: string) => {
    setState((current) =>
      current.phase === 'ready' ? { phase: 'ready', intents: current.intents.map((group) => ({ ...group, items: group.items.filter((item) => item.id !== id) })) } : current,
    );
  }, []);

  const pass = useCallback(
    async (id: string) => {
      const key = keys.current.get(id) ?? randomUUID();
      keys.current.set(id, key);
      const result = await apiPostOnce(`/picks/${id}/pass`, key);
      // Already decided somewhere else, or gone: the pick is not actionable any more, so it leaves the list either way.
      const settled = result.ok || result.code === 'NOT_FOUND' || (result.code === 'RULE_VIOLATION' && result.reason === 'ALREADY_DECIDED');
      if (settled) {
        keys.current.delete(id);
        removeLocally(id);
        return null;
      }
      return picksProblemText(result, strings.errorPass);
    },
    [removeLocally],
  );

  const wave = useCallback(
    async (id: string, note?: string): Promise<WaveOutcome> => {
      const key = waveKeys.current.get(id) ?? randomUUID();
      waveKeys.current.set(id, key);
      const result = await apiPostOnce<{ matched: boolean }>(`/picks/${id}/wave`, key, note ? { note } : {});
      if (result.ok) {
        waveKeys.current.delete(id);
        removeLocally(id);
        return { ok: true, matched: result.data.matched };
      }
      // Already decided somewhere else, or gone: the pick is not actionable any more, so it leaves the list either way.
      if (result.code === 'NOT_FOUND' || (result.code === 'RULE_VIOLATION' && result.reason === 'ALREADY_DECIDED')) {
        waveKeys.current.delete(id);
        removeLocally(id);
        return { ok: true, matched: false };
      }
      const reasonText =
        result.code === 'RULE_VIOLATION' && result.reason === 'BLOCKED'
          ? strings.pocketWaveBlocked
          : result.code === 'RULE_VIOLATION' && result.reason === 'DAILY_CAP_REACHED'
            ? strings.pocketWaveCapReached
            : picksProblemText(result, strings.errorWave);
      return { ok: false, error: reasonText };
    },
    [removeLocally],
  );

  const find = useCallback(
    (id: string) => (state.phase === 'ready' ? state.intents.flatMap((group) => group.items).find((item) => item.id === id) : undefined),
    [state],
  );

  return <PicksContext.Provider value={{ state, refreshing, reload, pass, wave, find }}>{children}</PicksContext.Provider>;
}

export function usePicks() {
  const value = useContext(PicksContext);
  if (!value) throw new Error('usePicks must be used inside PicksProvider');
  return value;
}
