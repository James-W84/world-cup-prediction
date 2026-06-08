# World Cup 2026 Predictor

A full-stack prediction game for the 2026 FIFA World Cup. Players predict match outcomes across group and knockout stages, earn points for correct predictions, and compete in private leagues.

## Stack

- **Frontend** — Next.js 15 (App Router), Zustand, TypeScript
- **Backend** — Express.js, Passport (Google OAuth), Prisma ORM, TypeScript
- **Database** — PostgreSQL (Neon in production, SQLite locally)
- **Hosting** — Render (API + Web), Neon (DB)

---

## Local Development

### Prerequisites

- Node.js 18+
- A Google OAuth app ([console.cloud.google.com](https://console.cloud.google.com))

### 1. Clone and install

```bash
git clone <repo-url>
cd world-cup-prediction

cd api && npm install
cd ../web && npm install
```

### 2. Configure the API

```bash
cp api/.env.example api/.env
```

Fill in `api/.env`:

```env
DATABASE_URL=file:./prisma/dev.db
NODE_ENV=development
PORT=4000
FRONTEND_URL=http://localhost:3000
SESSION_SECRET=any-random-string
GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<from Google Cloud Console>
GOOGLE_CALLBACK_URL=http://localhost:4000/auth/google/callback
FOOTBALL_DATA_API_KEY=<optional, from football-data.org>
CRON_API_KEY=any-random-string
```

### 3. Seed the database

```bash
cd api
npx prisma migrate dev --name init   # creates dev.db and runs migrations
npm run seed                          # seeds match schedule
```

To populate knockout bracket with fake team names for testing:

```bash
npx tsx -r dotenv/config src/scripts/seed-knockout-teams.ts
```

### 4. Run

```bash
# Terminal 1 — API (http://localhost:4000)
cd api && npm run dev

# Terminal 2 — Web (http://localhost:3000)
cd web && npm run dev
```

---

## Testing

### Automated tests

Tests run against a local SQLite copy of `dev.db` — **the production database is never touched**.

```bash
cd api && npm test
```

The test suite covers phase locking, cron scoring, group bonuses, match sync, and leaderboard ranking (37 tests, ~2s).

> **Prerequisite:** `dev.db` must exist (i.e. you've run `npm run seed` at least once). The test runner copies it fresh before each session.

If you've updated the schema or re-seeded matches, refresh the test database:

```bash
cd api && npm run test:setup   # cp prisma/dev.db prisma/test.db
```

---

### Manual QA — fixture scripts

Fixture scripts seed specific tournament states into your local `dev.db` so you can test the full request cycle (API → cron → database) without waiting for real match data.

**Safety:** Scripts abort if `DATABASE_URL` is not a `file:` URL, preventing accidental writes to production.

**Setup:** Export these two variables in your QA terminal once, then all commands below work as-is.

```bash
# Terminal 1 — local API
cd api && npm run dev

# Terminal 2 — QA terminal (run once to set vars for the session)
cd api
export DATABASE_URL=file:./prisma/dev.db
export CRON_API_KEY=$(grep CRON_API_KEY .env | cut -d '=' -f2)
```

#### Scenarios

**1. Group stage complete — test match scoring and group bonus**

```bash
npx tsx src/scripts/fixtures/state-group-a-complete.ts

# Fire the scoring cron
curl -s -X POST http://localhost:4000/admin/cron/score \
  -H "x-api-key: $CRON_API_KEY" | jq .

# Check points awarded
sqlite3 prisma/dev.db "SELECT username, totalPoints FROM users WHERE email='fixture@test.com';"
```

**2. All 12 groups complete — test group table bonus scoring**

```bash
npx tsx src/scripts/fixtures/state-all-groups-complete.ts

curl -s -X POST http://localhost:4000/admin/cron/score \
  -H "x-api-key: $CRON_API_KEY" | jq .
```

Expected: `scoreGroupTableBonuses` triggers for all 12 groups, `groupsScored: 12` in response.

**3. Knockout bracket locked — test that edits are blocked**

```bash
npx tsx src/scripts/fixtures/state-r32-locked.ts
```

Then open the app at `http://localhost:3000/predictions` — the knockout bracket should be greyed out and uneditable.

**4. Round of 32 complete — test R32 scoring**

```bash
npx tsx src/scripts/fixtures/state-r32-complete.ts

curl -s -X POST http://localhost:4000/admin/cron/score \
  -H "x-api-key: $CRON_API_KEY" | jq .
```

Expected: `fixture-user` earns 16 points (1 pt × 16 correct R32 predictions).

**5. Reset between scenarios**

```bash
npx tsx src/scripts/reset-test-data.ts
```

Clears all predictions, leagues, and group bonus records. Resets match statuses to UPCOMING. Users are preserved.

---

## Deployment

### Services

| Service  | Provider            | Purpose              |
| -------- | ------------------- | -------------------- |
| API      | Render (free)       | Express + Prisma     |
| Web      | Render (free)       | Next.js              |
| Database | Neon (free)         | PostgreSQL           |
| Cron     | cron-job.org (free) | Scoring + match sync |

### 1. Database — Neon

1. Create a project at [neon.tech](https://neon.tech)
2. Copy the **pooled connection string** from the Neon dashboard

### 2. Google OAuth

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials
2. Create an **OAuth 2.0 Client ID** (Web application)
3. Add authorised redirect URI: `https://wc2026-web-22bb.onrender.com/api/auth/google/callback`

### 3. Render — Blueprint deploy

1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → **New** → **Blueprint**
3. Connect your GitHub repo — Render detects `render.yaml` automatically
4. Click **Apply** — provisions API and Web services

### 4. Set environment variables

After first deploy, go to each service's **Environment** tab:

**wc2026-api**

| Key                     | Value                                                           |
| ----------------------- | --------------------------------------------------------------- |
| `DATABASE_URL`          | Neon pooled connection string                                   |
| `FRONTEND_URL`          | `https://wc2026-web.onrender.com`                               |
| `GOOGLE_CLIENT_ID`      | from Google Cloud Console                                       |
| `GOOGLE_CLIENT_SECRET`  | from Google Cloud Console                                       |
| `GOOGLE_CALLBACK_URL`   | `https://wc2026-web-22bb.onrender.com/api/auth/google/callback` |
| `FOOTBALL_DATA_API_KEY` | from football-data.org (optional)                               |

`SESSION_SECRET` and `CRON_API_KEY` are auto-generated by Render.

**wc2026-web**

| Key                | Value                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------- |
| `API_INTERNAL_URL` | `http://wc2026-api:10000` (Render internal network — set automatically via render.yaml) |

Trigger a manual redeploy of both services after setting env vars.

### 5. Seed production database

In the Render dashboard, go to **wc2026-api** → **Shell**:

```bash
npx tsx prisma/seed.ts
```

### 6. Set up cron jobs — cron-job.org

Create a free account at [cron-job.org](https://cron-job.org) and add two jobs. For each:

- **Method**: POST
- **Header**: `x-api-key: <CRON_API_KEY>` (copy from wc2026-api env vars)
- **Schedule**: every 5 minutes

| Job               | URL                                          |
| ----------------- | -------------------------------------------- |
| Sync matches      | `https://wc2026-api.onrender.com/cron/sync`  |
| Score predictions | `https://wc2026-api.onrender.com/cron/score` |

---

## Scoring

| Stage         | Points for correct prediction |
| ------------- | ----------------------------- |
| Group Stage   | 1 pt                          |
| Round of 32   | 1 pt                          |
| Round of 16   | 2 pts                         |
| Quarterfinals | 3 pts                         |
| Semifinals    | 3 pts                         |
| Final         | 5 pts                         |

**Group table bonus** — up to +4 pts per group for correctly predicting the final group standings order (1 pt per team placed correctly).

Knockout predictions lock atomically when the first Round of 32 match kicks off.

---

## Features

- **Google OAuth** sign-in
- **Group stage** — predict win/draw/loss for all 72 matches, auto-submitted on click
- **Knockout bracket** — predict round by round; later rounds unlock only when feeder matches are predicted
- **Predicted standings** — live table based on your group stage predictions, showing which 3rd-place teams advance
- **Private leagues** — create or join leagues with an invite code, compete on a shared leaderboard
- **Match schedule** — browse fixtures by group stage or knockout bracket/schedule view
- **Live scoring** — cron job syncs results and awards points automatically
