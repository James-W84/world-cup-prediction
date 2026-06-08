# AI.md

## 1. System DNA
- **Core Stack:** TypeScript, Node 18+, Express 4 API, Next.js 15 App Router web, React 19.
- **Paradigm:** Strict TS, early-return controllers, explicit JSON envelopes, client/server split.
- **Data & State:** Prisma 7, PostgreSQL production, `file:` SQLite adapter supported, Passport sessions, Zustand client stores.

## 2. Directory Taxonomy
- `[api/src/config/]`: env auth bootstrap
- `[api/src/controllers/]`: request business handlers
- `[api/src/jobs/]`: cron scoring sync
- `[api/src/lib/]`: external clients singletons
- `[api/src/middleware/]`: auth gate checks
- `[api/src/routes/]`: HTTP route registry
- `[api/src/types/]`: Express augmentation; read before changing `req.user`.
- `[api/prisma/]`: schema seed migrations
- `[web/src/app/]`: App Router pages
- `[web/src/components/]`: shared UI shells
- `[web/src/lib/]`: API client contracts
- `[web/src/store/]`: Zustand client state

## 3. Universal Development Standards
- **Typing:** `strict`; API `noImplicitAny`, `strictNullChecks`, `noImplicitReturns`, `noUnused*`; avoid `any` except existing Prisma enum casts.
- **Patterns:** Controllers send response then `return`; errors log via `logger`; API responses `{ success, data?, error?, message? }`; web fetches through `web/src/lib/api.ts` unless endpoint shape differs.
- **Styling:** Global CSS variables/classes in `web/src/app/globals.css`; existing inline styles common in pages; preserve dark compact card UI.
- **Auth:** Session cookie + Passport Google OAuth; protected API routes use `requireAuth`; web auth state from `useAuth`.
- **Database:** Prisma schema source of truth; compound unique keys drive upserts: `userId_matchId`, `userId_leagueId`, `provider_providerAccountId`.

## 4. CI/CD & Deployment
- **Platform:** Render (both services); internal network URL `http://wc2026-api:10000` used by Next.js rewrite (`API_INTERNAL_URL`).
- **Proxy architecture:** All frontend→API traffic routes through Next.js rewrite at `/api/:path*`; browser never calls the API domain directly. `GOOGLE_CALLBACK_URL` must point to `https://wc2026-web-22bb.onrender.com/api/auth/google/callback`.
- **GHA workflow:** `.github/workflows/deploy-to-render.yml`; path-filtered per service; secrets `RENDER_DEPLOY_HOOK_API` and `RENDER_DEPLOY_HOOK_WEB` stored in GitHub Environment named `deployment`.

## 5. Token Conservation & Persona Protocols
- **File Access:** Do not read lockfiles (`api/package-lock.json`, `web/package-lock.json`), `node_modules/`, `api/dist/`, `web/.next/`, `*.tsbuildinfo`, migration SQL unless explicitly commanded.
- **Output Constraints:** Return ONLY precise code blocks changing. Never re-write entire files for minor changes. Omit unrequested wrapper code.
- **Comms Profile:** Eradicate conversational filler ("Sure, I can help with that", "Here is the modified code"). State direct problem, output code diff, terminate response.
