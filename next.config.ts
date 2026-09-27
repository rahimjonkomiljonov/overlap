import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const isDev = process.env.NODE_ENV === "development";

/**
 * S20 (OWASP ASVS L2). No nonce: nonce-based CSP requires every page to opt into
 * dynamic rendering (Next.js can only inject a fresh nonce per request), which would
 * undo this app's static-rendering optimization (CLAUDE.md's very first gotcha, S01/S02)
 * across the whole site — 'unsafe-inline' for script/style is the documented Next.js
 * App Router trade-off without nonces (its own CSP guide's "Without Nonces" example
 * does the same in production, not just dev). 'unsafe-eval' is dev-only (React's
 * source-map/debugging eval, per the same guide).
 *
 * img-src needs the real Supabase Storage domain, not just 'self': every photo/selfie
 * `<Image>` (src/components/picks/pick-card.tsx and friends) sets `unoptimized` on
 * purpose (a short-lived signed URL shouldn't also be cached/rewritten by Next's image
 * proxy), so the browser loads the raw storage URL directly rather than a same-origin
 * proxied one — this is inert in the local-only phase (dev-storage's fallback route is
 * already same-origin) and only matters once Storage is configured at "publish".
 */
const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""};
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https://*.supabase.co;
  font-src 'self';
  connect-src 'self';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  upgrade-insecure-requests;
`
  .replace(/\s{2,}/g, " ")
  .trim();

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: cspHeader },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // No geolocation API anywhere in this app by design (E3, verified by
          // src/server/meetup/no-geolocation.test.ts) — deny it and every other
          // sensitive permission nothing here needs.
          {
            key: "Permissions-Policy",
            value: "geolocation=(), camera=(), microphone=(), payment=(), usb=()",
          },
          // Inert over plain http (every browser ignores it); harmless to set ahead of
          // the real domain/HTTPS this gets at "publish".
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
  },
  experimental: {
    serverActions: {
      // Next's default (1 MB) is smaller than this app's own MAX_PHOTO_BYTES/
      // MAX_SELFIE_BYTES (8 MB, src/server/profile/actions.ts and
      // src/server/verification/actions.ts): a real phone photo before sharp resizes it
      // can easily exceed 1 MB, so uploads between 1-8 MB were silently rejected by the
      // framework before ever reaching those checks — never caught because every e2e
      // test fixture (e2e/fixtures/*.jpg) is a few KB. Matches the app's own stated max.
      bodySizeLimit: "8mb",
    },
  },
};

export default withNextIntl(nextConfig);
