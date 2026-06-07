# Plan: World Cup Predictor Full-Stack Implementation

## TL;DR

Build a full-stack World Cup prediction app (2026) with group stage → knockout bracket predictions, group-based leaderboards, and atomic cron-driven scoring. Users authenticate via Google OAuth, save draft predictions (with localStorage conflict detection), submit predictions before kickoff, and compete in leagues with up-to-50-member leaderboards. Backend enforces prediction locks at kickoff (dual check: timestamp + status), scores via 5-min cron intervals, and aggregates scores into User.totalPoints for display.

---

## Architecture Layers

**Frontend:** React/Next.js + localStorage draft management + conflict detection UI  
**Backend:** Custom Express middleware + Google OAuth (Passport.js) + centralized auth guards  
**Database:** PostgreSQL (Prisma ORM) with indexed leaderboard queries  
**Deployment:** Vercel (frontend) + Render (Express backend) + Neon (PostgreSQL)

---

## Implementation Phases

### **Phase 1: Core Data Model & Database Setup**

_Goal: Locked schema with all constraints and indexes. No migrations later._

**Steps:**

1. Finalize Prisma schema with:
   - `User` (id, email, username, avatarUrl, totalPoints, createdAt)
   - `Account` (OAuth provider account mapping)
   - `League` (id, name, inviteCode)
   - `LeagueMember` (userId, leagueId, joinedAt) + **compound unique + index on leagueId**
   - `Match` (id, homeTeam, awayTeam, kickoffTime [UTC], stage, status, actualOutcome, createdAt)
   - `MatchPrediction` (userId, matchId, predictedOutcome, isSubmitted, isScored, scoredAt, pointsAwarded, createdAt, updatedAt)
   - `GroupStandings` (tentative: if needed for computed group results; TBD after bracket research)
   - Enums: `MatchStatus` (UPCOMING, LIVE, COMPLETED), `Stage` (GROUP, ROUND_OF_16, QF, SF, FINAL), `Outcome` (HOME_WIN, AWAY_WIN, DRAW)

2. Add constraints:
   - `MatchPrediction.predictedOutcome` cannot be DRAW if `Match.stage != GROUP` (enforced in business logic + tests)
   - `LeagueMember` unique on (userId, leagueId)
   - `Account` unique on (provider, providerAccountId)

3. Add indexes:
   - `LeagueMember(leagueId)` for leaderboard queries
   - `MatchPrediction(userId, matchId)` for user-specific queries
   - `Match(kickoffTime)` for cron scheduling
   - `Match(status)` for status-based queries

4. Generate and test Prisma migrations (local SQLite + production PostgreSQL)

_Verification:_ Run `prisma migrate dev`, confirm schema in DB, no type errors in generated client.

---

### **Phase 2: Authentication & Session Management**

_Goal: Users can log in via Google OAuth, sessions persisted, middleware guards private endpoints._

**Steps:**

1. Set up Google OAuth application (create GCP project, configure redirect URIs for local + Render deployment)

2. Implement Passport.js strategy for Google OAuth:
   - Serialize/deserialize User session
   - Handle callback: if Account exists, load User; if not, create User + Account
   - **Critical:** Use `providerAccountId` (Google's `sub` claim) as canonical identity, NOT email
   - One User per Google account (no multi-email collisions)

3. Add Express middleware:
   - Session middleware (express-session + store in PostgreSQL via connect-pg-simple)
   - `requireAuth` middleware: check `req.user`, return 401 if missing
   - `requireLeagueMember(leagueId)` middleware: check `LeagueMember` table, return 403 if not member

4. Add routes:
   - `GET /auth/google` → redirect to Google login
   - `GET /auth/google/callback` → OAuth callback, set session, redirect to frontend
   - `GET /auth/me` → return current user (for frontend app initialization)
   - `POST /auth/logout` → destroy session

_Verification:_

- Manual: Log in with Google, confirm session persists, logout works
- Test: Unit test OAuth callback creates/finds User correctly
- Test: `requireAuth` rejects unauthenticated requests with 401

---

### **Phase 3: Bracket Structure & Match Seeding**

_Goal: Hardcoded 2026 World Cup bracket loaded into DB via runnable seed script._

**Steps:**

1. Research 2026 World Cup format:
   - 48 teams, 8 groups of 6 (not traditional 4)
   - Group stage: all teams play 3 matches
   - Knockout: Top 2 per group advance → Round of 16 (32 teams)
   - Document advancement rules (e.g., Group A Winner vs. Group B Runner-up)

2. Define bracket structure (in code or seed file):
   - Groups: A–H with team assignments
   - Group stage matches: 8 groups × 15 matches each = 120 matches
   - Knockout matches: 16 + 8 + 4 + 2 + 1 = 31 matches
   - Total: 151 matches

3. Create seed script: `api/prisma/seed.ts`
   - Hardcode all match records (homeTeam, awayTeam, kickoffTime [UTC], stage)
   - Use Prisma client to insert (handles upsert/idempotency)
   - All initially status=UPCOMING, actualOutcome=null
   - **Idempotency:** Check if matches exist before inserting (or use `upsert` on unique key like matchId)
   - Add `"seed": "tsx prisma/seed.ts"` to `package.json` scripts

4. Deploy seed script as runnable command:
   - Local: `npm run seed` (or `yarn seed`)
   - Deployed (Render): SSH into container or add to deployment build step
   - Add to `.env.example` so user knows to run it post-deploy
   - Document in README: "After deployment, run `npm run seed` to populate World Cup matches"

5. Define dependent match logic (for bracket UI later):
   - Map knockout matches to predecessor group/matches
   - Example: "RO16 Match 1 winner goes to QF Match X"
   - **Tentative:** Store in Match records or separate BracketEdge table? (TBD after bracket research)

_Verification:_

- Local: Run `npm run seed`, confirm 151 matches in DB, no duplicates on re-run
- Production: Manually seed after Render deploy, confirm matches visible in API
- Count: 120 group stage + 31 knockout = 151 matches in DB
- Kickoff times: all UTC, all in June-July 2026
- No DRAW predictions allowed for stage != GROUP (verified in schema + tests)

---

### **Phase 4: REST API Endpoints (Backend)**

_Goal: Endpoints for predictions, leaderboard, league management, scoring (cron)._

**Steps:**

#### **4.1 Prediction Endpoints**

```
POST   /api/predictions
       Body: { matchId, predictedOutcome }
       Guards: requireAuth, prediction lock check (kickoffTime + status)
       Returns: MatchPrediction record or 410 if locked
       Logic: Dual check—if now > kickoffTime OR status !== UPCOMING, reject

GET    /api/predictions?matchId=X
       Guards: requireAuth
       Returns: User's prediction for match X (or null if none)

PUT    /api/predictions/:predictionId
       Body: { predictedOutcome }
       Guards: requireAuth, owns prediction, prediction lock check
       Returns: Updated MatchPrediction or 410 if locked

POST   /api/predictions/:predictionId/submit
       Guards: requireAuth, owns prediction, prediction lock check
       Logic: Set isSubmitted=true (if not already)
       Returns: MatchPrediction with isSubmitted=true or 410 if locked
```

#### **4.2 League Endpoints**

```
POST   /api/leagues
       Body: { name }
       Guards: requireAuth
       Logic: Generate unique inviteCode, create League, auto-add creator as member
       Returns: League record

GET    /api/leagues/:leagueId/leaderboard
       Guards: requireAuth, requireLeagueMember(leagueId)
       Query params: page=0, limit=50
       Returns: Sorted list of { username, totalPoints, rank } (sorted by totalPoints DESC, u.id ASC)
       Logic: JOIN LeagueMember + User, ORDER BY totalPoints DESC, id ASC LIMIT 50
       Index: LeagueMember(leagueId)

POST   /api/leagues/join
       Body: { inviteCode }
       Guards: requireAuth
       Logic: Lookup League by inviteCode, add User as LeagueMember if not already
       Returns: League record or error if already member

GET    /api/leagues/:leagueId
       Guards: requireAuth, requireLeagueMember(leagueId)
       Returns: League details + member list (or leaderboard snapshot)
```

#### **4.3 Match Endpoints (UI Data)**

```
GET    /api/matches?stage=GROUP
       Guards: requireAuth (optional, public could be ok)
       Returns: All matches for given stage with status + actualOutcome
       Query: All GROUP matches; or specific knockout stage

GET    /api/matches/:matchId/predictions
       Guards: requireAuth, requireLeagueMember (if league-scoped view)
       Returns: Current user's prediction + standings context for this match
```

#### **4.4 Cron/Admin Endpoints (Trigger Scoring)**

```
POST   /api/admin/cron/score
       Guards: requireAuth + admin check (or simple API key for cron agent)
       Logic:
         - Query all COMPLETED matches where predictions not yet scored
         - For each MatchPrediction where isScored=false:
           - Check if predictedOutcome === actualOutcome
           - Award points (1 point per correct prediction)
           - Set isScored=true, scoredAt=now()
           - Increment User.totalPoints in same $transaction
       Returns: { scoredCount, pointsAggregated }
       Idempotency: isScored=true prevents re-scoring
```

**Verification:**

- Endpoint tests: Mock auth, test prediction lock at kickoff
- Permission tests: Verify requireLeagueMember blocks access to other leagues
- Scoring test: Insert match + predictions, run cron, verify isScored + User.totalPoints updated

---

### **Phase 5: Cron Job for Scoring & Status Updates**

_Goal: Automated 5-min interval cron that scores completed matches and updates statuses._

**Steps:**

1. Implement cron runner (node-cron or Bull with Redis):
   - Runs every 5 minutes
   - Calls internal function (not exposed endpoint) `_scoreCompletedMatches()`

2. Update Match status pipeline:
   - If now > kickoffTime: transition UPCOMING → LIVE (if not already)
   - If match result available from World Cup API: transition LIVE → COMPLETED + populate actualOutcome

3. Integrate World Cup API polling (tentative):
   - Query API for live/completed matches
   - Fetch actualOutcome for COMPLETED matches
   - Update Match.status + Match.actualOutcome in DB

4. Implement `_scoreCompletedMatches()`:

   ```
   - Query all MatchPrediction where isScored=false AND match.status=COMPLETED
   - For each prediction:
     - If predictedOutcome === match.actualOutcome: pointsAwarded=1
     - Set isScored=true, scoredAt=now()
   - Aggregate: SUM(pointsAwarded) per User via $transaction
   - Update User.totalPoints += pointsAwarded (atomic)
   - Log: { timestamp, scoredCount, usersAffected }
   ```

5. Error handling & idempotency:
   - If cron crashes mid-transaction: `isScored=false` predictions not updated, next cron retry (safe)
   - If cron runs twice simultaneously: `isScored=true` skips already-scored (safe)
   - **No distributed lock needed** if idempotent via flag

_Verification:_

- Mock: Insert completed match + predictions, run `_scoreCompletedMatches()`, verify User.totalPoints incremented
- Cron test: Simulate multiple cron runs, verify no double-scoring

---

### **Phase 6: Frontend - Prediction Editing & Draft State**

_Goal: Users can save drafts locally (localStorage) and submit predictions. Conflict detection on page load._

**Steps:**

1. Create Prediction Editor component:
   - For each match in a stage (GROUP or KNOCKOUT):
     - Show: homeTeam vs. awayTeam, kickoffTime, current prediction (if any)
     - Inputs: Radio buttons for HOME_WIN / DRAW (if GROUP) / AWAY_WIN
     - Buttons: "Save Draft" (localStorage + DB), "Submit" (isSubmitted=true), "Discard Changes"

2. Draft state management (Zustand):
   - Store: `{ [matchId]: predictedOutcome, ...}`
   - localStorage key: `predictions_draft_${leagueId}`
   - Track dirty flag for unsaved changes badge

3. On page load (conflict detection):

   ```
   - Fetch all predictions for this user (DB state, isSubmitted)
   - Load localStorage draft
   - Compare: if localStorage.timestamp > DB.updatedAt
     - Show banner: "You have unsaved changes from X ago. Keep or discard?"
     - User chooses: keep (merge with DB + localStorage) or discard (clear localStorage, use DB)
   - Else: silently clear localStorage, use DB state
   ```

4. Save Draft button:

   ```
   - POST /api/predictions (or PUT if exists)
   - Body: { matchId, predictedOutcome, isSubmitted: false }
   - On success: clear localStorage, show "Saved" toast
   - On error: keep localStorage (data persisted locally)
   ```

5. Submit button:

   ```
   - Check kickoffTime: if now > kickoffTime, show error "Predictions locked"
   - POST /api/predictions/:id/submit
   - On success: set isSubmitted=true, hide "Unsaved changes" badge
   - On 410: show error "Predictions locked"
   ```

6. Discard button:
   ```
   - Fetch latest from DB
   - Clear localStorage
   - Re-render with DB state
   ```

_Verification:_

- Manual: Save draft, refresh page, confirm localStorage detected and banner shown
- Manual: Submit prediction before kickoff, confirm isSubmitted=true, score not yet shown
- Test: Draft conflict resolution (localStorage newer → banner, DB newer → silent clear)

---

### **Phase 7: Frontend - Leaderboard & League Views**

_Goal: Users see their league's leaderboard, ranked by points (with tiebreaker)._

**Steps:**

1. Leaderboard component:
   - Fetch `/api/leagues/:leagueId/leaderboard?page=0&limit=50`
   - Display table: Rank | Username | Points | Status (1st, 2nd, tied 3rd, etc.)
   - Rank logic:
     - If tied on totalPoints, both get same rank
     - Next rank skips (e.g., two 1st places, then 3rd)
   - Pagination: "Load more" button for next page

2. League details page:
   - Show: League name, member count, invite link
   - Button: Copy invite code to clipboard
   - List: Members with their current rank + points

3. Join league flow:
   - Input: Enter invite code
   - Button: "Join League"
   - On success: Add to leaderboard, show toast

_Verification:_

- Manual: Create league, invite another user, confirm leaderboard shows both users ranked correctly
- Test: Two users with same score, confirm tiebreaker (u.id) applied

---

### **Phase 8: Frontend - Match & Bracket Views (Information Only)**

_Goal: Users can view current state of groups, standings, and bracket progression._

**Steps:**

1. **Group stage view** (read-only):
   - Show all 8 groups with teams + points/goals (if available from API)
   - Show completed matches with results
   - Show upcoming matches with predictions (if user wants to add)

2. **Bracket view** (read-only):
   - Show knockout bracket tree (RO16 → QF → SF → Final)
   - Gray out matches not yet determined
   - Show qualified teams as they advance
   - Show predictions overlay (user's predictions vs. actual results)

3. Fetch match data:
   - `GET /api/matches?stage=GROUP` → all group matches
   - `GET /api/matches?stage=ROUND_OF_16` → all knockout matches
   - Render from flat Match records + computed bracket structure (TBD: hardcoded or dynamic)

_Verification:_

- Manual: View group standings, confirm matches populated correctly
- Manual: View bracket after group stage ends, confirm advancement logic correct

---

### **Phase 9: Testing & Validation**

_Goal: Core workflows validated end-to-end. No major bugs at launch._

**Steps:**

1. **Unit tests:**
   - OAuth callback: creates User + Account correctly, no dupes
   - Prediction lock: dual checks (kickoffTime + status) both prevent submit
   - Scoring: isScored flag prevents double-scoring, User.totalPoints incremented

2. **Integration tests:**
   - End-to-end: User logs in → joins league → saves predictions → cron scores → leaderboard updates
   - Authorization: User A cannot see User B's league predictions

3. **Cron tests:**
   - Mock API response, run cron, verify scoring idempotent

4. **Conflict detection (localStorage):**
   - Test: Old localStorage vs. new DB → banner shown → user chooses

5. **Prediction lock (race condition):**
   - Test: Submit prediction 1ms after kickoff → 410 error

---

## Relevant Files (to be created)

- **Prisma Schema & Seeding:**
  - `api/prisma/schema.prisma` — Full schema with indexes + constraints
  - `api/prisma/seed.ts` — Hardcoded WC26 matches (151 records), idempotent via upsert
  - `api/prisma/migrations/` — auto-generated (schema migrations only, not seeding)
  - `api/package.json` — Add script: `"seed": "tsx prisma/seed.ts"`
- **Auth Middleware:** `api/src/middleware/auth.ts` (requireAuth, requireLeagueMember)
- **OAuth Setup:** `api/src/config/passport.ts` (Google OAuth strategy)
- **API Routes:** `api/src/routes/predictions.ts`, `api/src/routes/leagues.ts`, `api/src/routes/matches.ts`, `api/src/routes/cron.ts`
- **Cron Job:** `api/src/jobs/score-cron.ts` (5-min interval scorer)
- **Frontend Components:**
  - `web/src/components/PredictionEditor.tsx` (draft + submit UI)
  - `web/src/components/Leaderboard.tsx` (league rankings)
  - `web/src/components/GroupStandings.tsx` (group stage view)
  - `web/src/components/Bracket.tsx` (knockout bracket view)
- **Frontend State:** `web/src/store/predictions.ts` (Zustand draft state + localStorage)
- **Documentation:**
  - `api/README.md` — Deployment instructions, include "After deploy, run `npm run seed` to populate matches"
- **Tests:**
  - `api/src/__tests__/auth.test.ts`
  - `api/src/__tests__/predictions.test.ts`
  - `api/src/__tests__/cron.test.ts`
  - `web/src/__tests__/PredictionEditor.test.tsx` (conflict detection)

---

## Verification Steps

1. **Schema & DB:**
   - Prisma migrate → confirm all tables, indexes, constraints
   - Query sample: leaderboard for 50 users in league → <500ms

2. **Auth:**
   - Google OAuth callback → User created, session set
   - `requireAuth` on endpoint → 401 without session
   - `requireLeagueMember` on leaderboard → 403 if not member

3. **Predictions:**
   - Save draft before kickoff → DB record created, isSubmitted=false
   - Submit before kickoff → isSubmitted=true
   - Submit after kickoff → 410 error (dual check fired)
   - localStorage conflict → banner shown, user choice respected

4. **Leaderboard:**
   - After cron scores 10 predictions → User.totalPoints incremented
   - Two users tied → tiebreaker (u.id) applied, both ranked 1st, next is 3rd
   - Pagination → 50 users per page, "Load more" button works

5. **Cron:**
   - Run twice in succession → no double-scoring (isScored=true prevents)
   - Crash mid-transaction → unscore d predictions safe, next cron retries

6. **UI State Conflicts:**
   - Predictions in localStorage + DB → on page load, conflict banner shown
   - Discard → clear localStorage, use DB state
   - Keep → merge (TBD: strategy)

---

## Decisions & Scope Boundaries

**IN:**

- Group stage predictions (all 120 matches)
- Knockout predictions (once bracket locked)
- League leaderboards (up to 50 members)
- Google OAuth authentication
- Draft predictions with localStorage backup
- Cron-based scoring (5-min intervals)
- Hardcoded 2026 World Cup bracket

**OUT (Phase 2+):**

- Dynamic cron scheduling per-match
- Configurability for other tournaments
- Manual admin UI for workflow triggers
- Advanced scoring (group stage tiebreakers, accuracy %)
- Real-time leaderboard updates (WebSocket)
- Postponement/cancellation workflows
- Correction audit logs (simple manual DB fixes for now)

---

## Risks & Mitigations

| Risk                                     | Severity | Mitigation                                                             |
| ---------------------------------------- | -------- | ---------------------------------------------------------------------- |
| Cron double-scores predictions           | HIGH     | `isScored` flag + `scoredAt` timestamp, idempotent retry               |
| User submits after kickoff (race)        | HIGH     | Dual check (timestamp + status) + 410 response                         |
| localStorage vs. DB conflict             | MEDIUM   | Conflict detection banner on page load                                 |
| Leaderboard query slowness (50+ leagues) | MEDIUM   | Index on LeagueMember(leagueId), pagination                            |
| OAuth token expiry                       | MEDIUM   | express-session + auto-refresh (defer to Phase 2)                      |
| Missing predictions in GROUP stage       | MEDIUM   | Validation: all GROUP matches must have prediction before bracket lock |
| Bracket advancement incorrect            | HIGH     | Hardcode + manual verification against FIFA rules                      |

---

## Next Steps (Handoff)

1. Review this plan for gaps or conflicts
2. Clarify any ambiguities (bracket structure details, etc.)
3. Approve and begin implementation of Phase 1 (schema + DB setup)
