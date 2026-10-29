import { useEffect, useState } from 'react';
import { Linking } from 'react-native';

import { Body, Button, Card, Title } from '@/components/ui';
import { disablePush, enablePush, isPushOnHere, readPermission, type EnableFailure } from '@/lib/push';
import { strings } from '@/lib/strings';

type State = { phase: 'loading' } | { phase: 'ready'; on: boolean | null; blocked: boolean };

/**
 * The phone's own push switch. The permission prompt appears only when the person taps "turn on", never at
 * launch. Turning it off forgets this phone's token on the server; the phone-level permission is left alone.
 */
export function PushCard() {
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([isPushOnHere(), readPermission().catch(() => ({ granted: true, canAskAgain: true }))]).then(([on, permission]) => {
      if (active) setState({ phase: 'ready', on, blocked: !permission.granted && !permission.canAskAgain });
    });
    return () => {
      active = false;
    };
  }, []);

  async function onTurnOn() {
    setBusy(true);
    setError(null);
    const result = await enablePush();
    const permission = await readPermission().catch(() => ({ granted: true, canAskAgain: true }));
    setBusy(false);
    if (result.ok) return setState({ phase: 'ready', on: true, blocked: false });
    const reason: EnableFailure = result.reason;
    setError(strings.pushErrors[reason] ?? strings.pushErrors.server);
    setState({ phase: 'ready', on: false, blocked: !permission.granted && !permission.canAskAgain });
  }

  async function onTurnOff() {
    setBusy(true);
    setError(null);
    const done = await disablePush();
    setBusy(false);
    if (done) return setState({ phase: 'ready', on: false, blocked: false });
    setError(strings.pushOffError);
  }

  return (
    <Card>
      <Title>{strings.privacyNotificationsTitle}</Title>
      <Body tone="muted">{strings.privacyNotificationsBody}</Body>
      {state.phase === 'ready' && state.on !== null ? <Body>{state.on ? strings.pushOn : strings.pushOff}</Body> : null}
      {error ? <Body tone="bad">{error}</Body> : null}
      {state.phase === 'ready' && state.on ? (
        <Button label={busy ? strings.pushWorking : strings.pushTurnOff} variant="outline" disabled={busy} onPress={() => void onTurnOff()} />
      ) : null}
      {state.phase === 'ready' && state.on === false && !state.blocked ? (
        <Button label={busy ? strings.pushWorking : strings.pushTurnOn} disabled={busy} onPress={() => void onTurnOn()} />
      ) : null}
      {state.phase === 'ready' && state.blocked ? <Button label={strings.pushOpenSettings} variant="outline" onPress={() => void Linking.openSettings()} /> : null}
    </Card>
  );
}
