import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

// Locale routing only. Never rely on the proxy for authorization: check access
// inside every server action and route handler (see docs/BUILD_PLAN.md, S03).
export default createMiddleware(routing);

export const config = {
  // Skip API routes, Next.js internals and files with an extension (e.g. favicon.ico).
  matcher: "/((?!api|trpc|_next|_vercel|.*\\..*).*)",
};
