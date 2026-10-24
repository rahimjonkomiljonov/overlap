import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { apiGet, type ApiErrorCode } from './api';
import { authClient } from './auth-client';

export type Me = { userId: string; email: string; name: string; role: string; status: string; accountSetupComplete: boolean; profileComplete: boolean };

type MeState = { phase: 'idle' } | { phase: 'loading' } | { phase: 'ready'; me: Me } | { phase: 'failed'; code: ApiErrorCode };

const MeContext = createContext<{ state: MeState; refresh: () => void } | null>(null);

/**
 * Asks the server who is signed in, once there is a session, and again on `refresh()` (after account
 * setup, for instance). If the server no longer accepts the session (expired, revoked, account
 * deleted) it signs out locally, and the layout shows the sign-in screen.
 */
export function MeProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [state, setState] = useState<MeState>({ phase: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    apiGet<Me>('/me').then((result) => {
      if (!active) return;
      if (result.ok) return setState({ phase: 'ready', me: result.data });
      if (result.code === 'UNAUTHENTICATED') return void authClient.signOut();
      setState({ phase: 'failed', code: result.code });
    });
    return () => {
      active = false;
    };
  }, [enabled, attempt]);

  const refresh = useCallback(() => {
    setState({ phase: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  // Nobody signed in means there is nothing to ask. Mount this with a `key` that changes with the
  // person, so a different account never inherits the previous one's answer.
  const shown: MeState = enabled ? state : { phase: 'idle' };
  return <MeContext.Provider value={{ state: shown, refresh }}>{children}</MeContext.Provider>;
}

export function useMe() {
  const value = useContext(MeContext);
  if (!value) throw new Error('useMe must be used inside MeProvider');
  return value;
}
