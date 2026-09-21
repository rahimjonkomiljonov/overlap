@AGENTS.md

# Overlap: campus dating app

Build it step by step from `docs/BUILD_PLAN.md`. The full product spec is `docs/REQUIREMENTS.md`.

## Working protocol

- At the start of a session, read `docs/BUILD_PLAN.md`, find the first unchecked step (`- [ ]`) and do only that step.
- Before coding a step, fetch current docs with Context7 for every library it touches. For Next.js 16 also read the matching guide in `node_modules/next/dist/docs/`.
- A step is done only when every "Done when" check passes. Then tick its box, add a line to the Progress Log in `docs/BUILD_PLAN.md`, and commit as `Sxx: title`.
- Stop at checkpoints C1 to C4 and wait for the owner's review.
- Build only what is in the Month-1 scope map. New ideas go to the Fast-follow list. Split any step that runs past 1.5x its budget.

## Hard rules (privacy and safety)

- Never commit secrets. Keys live in `.env.local`; `.env.example` lists names only.
- Never store resident registration numbers. Never log, track or send to a third party: `interested_in`, selfies, chat text.
- Every server action and route handler checks authorization itself; the proxy only routes locales.
- Synthetic users exist only in dev and staging.

## Commands

- `npm run dev` starts the app, `npm run check` runs lint, typecheck and unit tests, `npm run e2e` runs Playwright.
- Next.js 16: `src/proxy.ts` replaces `middleware.ts`. Korean is served at `/`, English at `/en`.
