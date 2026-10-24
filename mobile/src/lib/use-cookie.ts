import { useEffect, useState } from 'react';

import { authClient } from './auth-client';

/**
 * The session cookie, for loading pictures that live on our own server. `null` until it has been read: a picture
 * must not be requested before then, because the phone remembers a failed picture by its address and would not retry
 * it once the cookie arrives.
 */
export function useCookie(): string | null {
  const [cookie, setCookie] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    Promise.resolve(authClient.getCookie()).then((value) => active && setCookie(value));
    return () => {
      active = false;
    };
  }, []);
  return cookie;
}
