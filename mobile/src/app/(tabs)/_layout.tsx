import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';

import { colors } from '@/components/ui';
import { tapFeedback } from '@/lib/haptics';
import { strings } from '@/lib/strings';

type Icon = SymbolViewProps['name'];

const ICONS: Record<'index' | 'matches' | 'waves' | 'events' | 'me', Icon> = {
  index: { ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' },
  matches: { ios: 'heart.fill', android: 'favorite', web: 'favorite' },
  waves: { ios: 'hand.wave.fill', android: 'waving_hand', web: 'waving_hand' },
  events: { ios: 'calendar', android: 'calendar_month', web: 'calendar_month' },
  me: { ios: 'person.crop.circle', android: 'account_circle', web: 'account_circle' },
};

function icon(name: keyof typeof ICONS) {
  return function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <SymbolView name={ICONS[name]} tintColor={color} size={size} />;
  };
}

/**
 * The five places people go all day, as a bottom bar. Everything else (a pick, a chat, an event, the plan, safety,
 * privacy) opens on top of it and has its own Back. Only reached by someone whose profile is finished: the root layout
 * keeps everyone else out.
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenListeners={{ tabPress: tapFeedback }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '700' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: strings.tabPicks, tabBarIcon: icon('index') }} />
      <Tabs.Screen name="matches" options={{ title: strings.tabMatches, tabBarIcon: icon('matches') }} />
      <Tabs.Screen name="waves" options={{ title: strings.tabWaves, tabBarIcon: icon('waves') }} />
      <Tabs.Screen name="events" options={{ title: strings.tabEvents, tabBarIcon: icon('events') }} />
      <Tabs.Screen name="me" options={{ title: strings.tabMe, tabBarIcon: icon('me') }} />
    </Tabs>
  );
}
