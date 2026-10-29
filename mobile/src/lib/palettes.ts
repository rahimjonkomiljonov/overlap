/**
 * Every colour the app uses, once for light and once for dark. Dark follows the phone's setting. Pairs that carry
 * text keep at least 4.5:1 contrast (`onBrand` on `brand`, `ink` on `card`, `muted` on `background`).
 */
const light = {
  background: '#faf8f3',
  card: '#ffffff',
  border: '#e8e4da',
  ink: '#12202b',
  muted: '#5b6b78',
  brand: '#07746d',
  onBrand: '#ffffff',
  good: '#0a7a52',
  bad: '#b3261e',
  warn: '#8a5a00',
  warnBackground: '#fff1cf',
  badBackground: '#fdecea',
  inputBorder: '#cfd6dc',
  chipSelected: '#e3f4f2',
  tag: '#d8f3ef',
};

export type Palette = typeof light;

const dark: Palette = {
  background: '#0e1a20',
  card: '#17262e',
  border: '#2b3d47',
  ink: '#eef3f5',
  muted: '#a6b5bf',
  brand: '#3fd3c8',
  onBrand: '#05231f',
  good: '#5fd8a5',
  bad: '#ff9088',
  warn: '#f3bb55',
  warnBackground: '#3b2d0c',
  badBackground: '#3d1a18',
  inputBorder: '#44575f',
  chipSelected: '#14403c',
  tag: '#174440',
};

export const palettes = { light, dark };
