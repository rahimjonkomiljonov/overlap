import { expoClient } from '@better-auth/expo/client';
import { createAuthClient } from 'better-auth/react';
import { emailOTPClient } from 'better-auth/client/plugins';
import * as SecureStore from 'expo-secure-store';

import { API_URL } from './config';

/**
 * Signs in with the same email code as the website. The session cookie is kept in the
 * phone's secure storage (Keychain / Keystore), never in plain storage.
 * `scheme` must match the scheme in app.json and the server's `trustedOrigins`.
 */
export const authClient = createAuthClient({
  baseURL: API_URL,
  plugins: [
    expoClient({ scheme: 'overlap', storagePrefix: 'overlap', storage: SecureStore }),
    emailOTPClient(),
  ],
});
