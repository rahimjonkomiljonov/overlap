import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["ko", "en"],
  defaultLocale: "ko",
  // Korean is served at "/", English at "/en".
  localePrefix: "as-needed",
});
