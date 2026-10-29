import { useMemo } from 'react';
import { useColorScheme } from 'react-native';

import { palettes, type Palette } from './palettes';

export type { Palette };

/** The palette for the phone's current setting (light when it has none). */
export function useColors(): Palette {
  return useColorScheme() === 'dark' ? palettes.dark : palettes.light;
}

/** Builds a screen's styles from the current palette; rebuilt only when the phone switches between light and dark. */
export function useStyles<T>(make: (colors: Palette) => T): T {
  const colors = useColors();
  return useMemo(() => make(colors), [make, colors]);
}
