import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "ko"],
  defaultLocale: "en",
  // English is served at "/", Korean at "/ko".
  localePrefix: "as-needed",
  // Everyone gets English first, whatever their browser language is; the language switch on
  // the landing page and in settings moves to Korean. Set this back to true to send Korean
  // browsers to "/ko" automatically.
  localeDetection: false,
});
