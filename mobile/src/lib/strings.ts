import { getLocale } from './locale';
import { en, type Strings } from './strings.en';
import { ko } from './strings.ko';

export type { Strings };

/**
 * The words the screens show, in the language in use right now. Every `strings.x` is looked up at the moment it is
 * read, so a screen shows the current language the next time it renders (the app re-renders everything when the
 * person switches language). Do not read `strings` at import time: that would freeze the language at start-up.
 */
export const strings: Strings = new Proxy({} as Strings, {
  get: (_target, key) => (getLocale() === 'ko' ? ko : en)[key as keyof Strings],
});
