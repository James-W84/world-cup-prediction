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

## 4. Token Conservation & Persona Protocols
- **File Access:** Do not read lockfiles (`api/package-lock.json`, `web/package-lock.json`), `node_modules/`, `api/dist/`, `web/.next/`, `*.tsbuildinfo`, migration SQL unless explicitly commanded.
- **Output Constraints:** Return ONLY precise code blocks changing. Never re-write entire files for minor changes. Omit unrequested wrapper code.
- **Comms Profile:** Eradicate conversational filler ("Sure, I can help with that", "Here is the modified code"). State direct problem, output code diff, terminate response.
