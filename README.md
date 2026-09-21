# Overlap

A campus web app that matches students on shared campus life (courses, clubs, places, free time), with explained matches, safety-first design and Korean-first UI.

- Build order (source of truth): [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md)
- Full product requirements: [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md)

## Develop

```bash
cp .env.example .env.local   # then fill in the values you need
npm install
npm run dev                  # http://localhost:3000 (Korean), /en for English
npm run check                # lint, typecheck, unit tests
npm run e2e                  # Playwright (starts the dev server itself)
```

Stack: Next.js 16 (App Router) + TypeScript, Tailwind CSS 4, shadcn/ui (Radix), next-intl, Vitest, Playwright.
