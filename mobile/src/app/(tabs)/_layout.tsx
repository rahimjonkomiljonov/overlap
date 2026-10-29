import { Tabs } from 'expo-router';
import { PixelRatio, Text, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';

import { tapFeedback } from '@/lib/haptics';
import { useColors } from '@/lib/theme';
import { strings } from '@/lib/strings';

type Icon = SymbolViewProps['name'];

const ICONS: Record<'index' | 'matches' | 'waves' | 'events' | 'me', Icon> = {
  index: { ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' },
  matches: { ios: 'heart.fill', android: 'favorite', web: 'favorite' },
  waves: { ios: 'hand.wave.fill', android: 'waving_hand', web: 'waving_hand' },
  events: { ios: 'calendar', android: 'calendar_month', web: 'calendar_month' },
  me: { ios: 'person.crop.circle', android: 'account_circle', web: 'account_circle' },
};

/**
 * The label under a tab icon. It grows with the phone's text size but stops at 1.3x: the bar is a fixed strip, and at
 * 2x the words were cut off ("Matc…") and the icons cropped. Everything else on screen scales without a limit.
 */
function TabLabel({ color, children }: { color: ColorValue; children: string }) {
  return (
    <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={{ color, fontSize: 12, fontWeight: '700' }}>
      {children}
    </Text>
  );
}

function icon(name: keyof typeof ICONS) {
  return function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    // The symbol is drawn as a font glyph, so the phone's text size would enlarge it past its box and crop it.
    const px = size / Math.max(1, PixelRatio.getFontScale());
    return <SymbolView name={ICONS[name]} tintColor={color} size={px} style={{ width: size, height: size }} />;
  };
}

/**
 * The five places people go all day, as a bottom bar. Everything else (a pick, a chat, an event, the plan, safety,
 * privacy) opens on top of it and has its own Back. Only reached by someone whose profile is finished: the root layout
 * keeps everyone else out.
 */
export default function TabsLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenListeners={{ tabPress: tapFeedback }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.muted,
        // Tall enough for an icon above a label at the largest allowed label size (1.3x), so nothing is cropped.
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border, height: 68 + insets.bottom },
        tabBarLabel: (props) => <TabLabel {...props} />,
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
