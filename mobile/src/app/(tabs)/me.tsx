import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Chip } from '@/components/form';
import { Body, Button, Card, Notice, Screen, Title } from '@/components/ui';
import { authClient } from '@/lib/auth-client';
import { getChoice, returnAfterSwitch, setChoice, type LocaleChoice, useLocale } from '@/lib/locale';
import { useMe } from '@/lib/me';
import { strings } from '@/lib/strings';

const statusNotice = (status: string): string | undefined => ({ PAUSED: strings.statusPaused, SUSPENDED: strings.statusSuspended, BANNED: strings.statusBanned })[status as 'PAUSED'];

/** The app's language: follow the phone, or always English, or always Korean. The two language names are written in their own language. */
function LanguageCard() {
  useLocale(); // re-render when the choice changes
  const choice = getChoice();
  const options: { value: LocaleChoice; label: string }[] = [
    { value: 'phone', label: strings.languagePhone },
    { value: 'en', label: 'English' },
    { value: 'ko', label: '한국어' },
  ];
  return (
    <Card>
      <Title>{strings.languageTitle}</Title>
      <Body tone="muted">{strings.languageHint}</Body>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map((o) => (
          <Chip key={o.value} label={o.label} selected={choice === o.value} onPress={() => {
              if (choice !== o.value) returnAfterSwitch('/me');
              void setChoice(o.value);
            }} />
        ))}
      </View>
    </Card>
  );
}

/** The fifth tab: who I am, and the places that are mine rather than part of the daily loop (safety, privacy, verification). */
export default function MeScreen() {
  const router = useRouter();
  const { state } = useMe();
  const me = state.phase === 'ready' ? state.me : null;

  return (
    <Screen>
      <Title>{strings.tabMe}</Title>

      {me && statusNotice(me.status) ? <Notice>{statusNotice(me.status)}</Notice> : null}

      {me ? (
        <Card>
          <Body tone="muted">{strings.signedInAs}</Body>
          <Body>{me.email}</Body>
        </Card>
      ) : null}

      <LanguageCard />

      <Button label={strings.pocketsOpen} variant="outline" onPress={() => router.push('/pockets')} />
      <Button label={strings.prefsOpen} variant="outline" onPress={() => router.push('/preferences')} />
      <Button label={strings.safetyOpen} variant="outline" onPress={() => router.push('/safety')} />
      <Button label={strings.privacyOpen} variant="outline" onPress={() => router.push('/privacy')} />
      <Button label={strings.homeVerify} variant="outline" onPress={() => router.push('/verify')} />
      <Button label={strings.signOut} variant="outline" onPress={() => void authClient.signOut()} />
    </Screen>
  );
}
