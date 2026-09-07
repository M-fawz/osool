# Osool — progress and roadmap

The single source of truth for what is done, what is not, and what is next.
Updated as work happens, not at the end. If context is lost, this file plus
`git log` is enough to resume.

Phases 0–2 (checkpoint, baseline truth, correctness closure) are closed; their
detailed log is kept in `docs/reports/PHASE-0-2-LOG.md`. This file starts from
Phase 3 — making the system demonstrable end to end.

---

## CURRENT STATUS

_Last updated 2026-09-07, end of session._

| | |
|---|---|
| **Branch** | `main` |
| **Commit** | `d0783cc` — pushed; remote and local agree |
| **Session** | 11 commits, from `71bfc60` |
| **Tests** | **181 passing / 21 files / 0 failed / 0 skipped** (was 152 / 19) |
| **Full gate** | `npm run ci` → **exit 0** — typecheck · lint · no-deletes · one-archiver · i18n · tests · build |
| **Browser** | `npm run qa:browser` → **56 passed, 0 failed** (new this session) |
| **Local database** | Embedded PostgreSQL 16 on `127.0.0.1:5433`, healthy |
| **Local demo** | **Working end to end.** Registration, sign-in, application, upload, register search, appointment booking, all eleven roles, Arabic and English, desktop and phone |
| **Production code** | `main` is current |
| **Production deployment** | **Still serving the pre-session build.** No CSP header and `/api/health` returns HTML, which is how you can tell from outside |
| **Production database** | **Does not exist.** `db.wqwapqlzplixsvwcndjc.supabase.co` → NXDOMAIN |
| **Why the deployment is stuck** | `scripts/vercel-build.mjs` runs `prisma migrate deploy` on production before `next build`. The database is unreachable, the step fails, the build fails, and the deployment is never promoted — so the old one keeps serving. Working as designed; the input is missing |

---

## PRIORITY ROADMAP

Statuses: `NOT STARTED` · `IN PROGRESS` · `BLOCKED` · `COMPLETED` · `VERIFIED` · `DEFERRED`

`COMPLETED` means the code is written and the gates pass. `VERIFIED` means it
has additionally been exercised through the running application and observed to
work. Nothing is marked `VERIFIED` on the strength of a passing unit test alone.

---

### P0 — DEMO / CORE WORKING

Everything required to demonstrate Osool end to end.

#### P0.0 — The Content Security Policy rendered every page blank

- **Status:** VERIFIED
- **Completed:** 2026-09-07
- **Severity:** this was the whole product being unavailable. Not a defect in a
  screen — a defect in every screen.
- **Files:** `src/middleware.ts`, `next.config.ts`
- **Finding:** the production policy was `script-src 'self'`, on the stated
  reasoning that "`next dev` injects inline bootstrapping and the React refresh
  runtime; the production bundle does not". That premise is false. The App
  Router's production output is full of inline scripts — the
  `self.__next_f.push(...)` calls carrying the React Server Component payload,
  and the ones that move streamed Suspense content out of the hidden templates
  it is first written into. The browser blocked all of them. **Every route in
  the deployed application rendered a blank white screen**, while the server
  answered `200` with correct HTML throughout.
- **Why it survived:** `next dev` was fine, because development allows
  `'unsafe-inline'`. The HTTP harness that signs in as ten roles and probes
  fourteen routes was fine, because it reads status codes and never renders.
  Both were green. Neither is a browser, and — as the Phase 2 log records —
  "no screen has been rendered in a browser this session."
- **What changed:** the policy moved from a static header in `next.config.ts`
  into `src/middleware.ts`, which is the only place that can mint a per-request
  nonce. `script-src` is now `'self' 'nonce-<per request>' 'strict-dynamic'`.
  `'unsafe-inline'` was deliberately *not* used: it would have been one line and
  would have given up the control the header exists for. API routes, which the
  middleware matcher excludes, got their own stricter policy — `default-src
  'none'`, since a JSON response needs nothing.
- **Cost:** pages carrying a nonce cannot be statically cached. Nearly every
  screen already rendered dynamically because it reads a session, so what this
  changes in practice is a handful of public pages.
- **Evidence:** before — `body text length: 0`, five CSP violations in the
  console. After — the page renders, `0` CSP violations, and the sign-in screen
  is legible in `.proof/screens/after-csp-fix.png`. The browser harness asserts
  it twice so it cannot regress silently.

#### P0.0b — Two rate limiters were running and the wrong one answered

- **Status:** VERIFIED
- **Completed:** 2026-09-07
- **Severity:** demo-blocking. Switching roles four times in a row was refused.
- **Files:** `src/lib/auth/index.ts`
- **Finding:** Better Auth ships its own rate limiter, on by default in
  production, with a special rule for `/sign-in*`, `/sign-up*`,
  `/change-password*` and `/change-email*` of **three requests per ten seconds**,
  counted **in memory**. This product has its own in
  `src/lib/security/rate-limit.ts`, and Better Auth's fired first. So the
  refusal a user actually saw was
  `{"message":"Too many requests. Please try again later."}` — English only, no
  reason, no next step, nobody to ask, against a rule in CLAUDE.md that admits
  no exceptions. Three sign-ins per ten seconds is also not a budget for this
  product: an office where a clerk, an examiner and a reviewer sign in one after
  another has spent it. And it counts in memory, which is the reason the
  database-backed limiter was written in the first place — on a serverless host
  each instance keeps its own counter.
- **How it was found:** the browser harness reported reviewer, auditor and
  administrator as failing, then a different three on the next run. It looked
  like the register's own limiter working correctly and was written up as such.
  Signing in as twelve roles eight seconds apart outside the browser reproduced
  it at exactly **every fourth** attempt — too regular for a budget of forty per
  five minutes — and the refusal body was not the bilingual one this product
  sends. That was the tell.
- **Fix:** `rateLimit: { enabled: false }` on the Better Auth config, so the
  register's own limiter is the single authority.
- **Evidence:** before — every 4th of 12 sign-ins refused at 8s spacing. After —
  **twelve roles 1.5 seconds apart, twelve succeed**. Brute force still refused:
  six wrong passwords on one account gives 429 with the four-part
  Arabic-and-English notice stating what is blocked, that the account is *not*
  suspended, when to retry, and who to contact.

#### P0.1 — Broker self-registration

- **Status:** VERIFIED — driven through a browser end to end
- **Browser evidence:** a firm filled the form, the account was reported open,
  the confirmation named the address, a bilingual verification mail was issued
  (Arabic first, English mirror), the link was followed, the account signed in
  and reached its own portal showing the firm's own trade name. In the database:
  `role=BROKER_OWNER`, `status=ACTIVE`, `emailVerified=true`, firm attached,
  audit event `BROKER_SELF_REGISTERED` at `seq 6280`. The on-screen link is
  correctly **withheld** on a production build.
- **Completed:** 2026-09-07
- **What changed:** new `src/lib/auth/self-registration.ts` (`registerBroker`,
  creating `Party` + `BrokerEntity` in one transaction, then the user through
  Better Auth's ordinary sign-up, then the link and the audit event); new public
  route `src/app/[locale]/signup/` (page, Server Action, client form); a
  registration link added under the sign-in form; 24 new message keys per locale.
  The account is created `ACTIVE` with an unverified address — `PENDING_ACTIVATION`
  would strand it, since `requireSession` refuses that status and the only
  transition out of it runs on a password reset. `requireEmailVerification` is
  what gates the sign-in.
- **Evidence:** `tests/integration/self-registration.test.ts` — **13 passing**,
  including "refuses the sign-in until the address is confirmed" (driven through
  the real `auth.api.signInEmail`, not the config object) and "cannot be used to
  mint a government role".

#### P0.2 — Officer queue pagination

- **Status:** VERIFIED — driven through a browser
- **Browser evidence:** the queue states a real total, paging controls render,
  pages 2, 3 and 10 are each reachable with different rows from page 1, a larger
  page size is honoured, the search narrows the queue, and the Arabic queue is
  right-to-left with rows.
- **Completed:** 2026-09-07
- **What changed:** `RoleQueue` now takes `page`, `search`, `basePath` and
  `searchParams`, passes the page to the loader and renders `Pagination`;
  `QueuePage` reads them from the URL with `readPage`; all six queue pages
  thread `searchParams` through. A search box was added at the same time — the
  loader has taken a `search` term since it was written and no screen ever
  passed one. 12 new message keys per locale.
- **Evidence:** `tests/integration/queue-pagination.test.ts` — **15 passing**
  against a **5,000-row** fixture. Rows 1, 50, 51, 101, 500, 4,999 and 5,000
  each reachable through the page a user would be on; no row lost or repeated
  across all 100 pages; a page past the end returns empty with the total still
  true. This also closes the 5,000-row fixture listed as "deliberately not done"
  in Phase 2.

#### P0.3 — Credentials out of source

- **Status:** COMPLETED
- **Completed:** 2026-09-07
- **What changed:** new `scripts/lib/credentials.mjs`. The four QA harnesses now
  resolve the administrator from `OSOOL_QA_ADMIN_EMAIL` / `OSOOL_QA_ADMIN_PASSWORD`,
  falling back to the published `admin@osool.test` demonstration account **only
  when the target is this machine** — against any other host the harness stops
  and asks for a credential. `seed-phase1.ts` reads an optional administrator
  from `OSOOL_ADMIN_EMAIL` / `OSOOL_ADMIN_PASSWORD` and creates none if unset.
  `QA_BASE` no longer defaults to the production URL; it defaults to localhost.
  The address and password were also removed from five documents.
- **Consequence:** seeding no longer produced any `SYSTEM_ADMIN`, so
  `admin@osool.test` was added to `DEMO_OFFICIALS` along with `inspector@` and
  `analyst@`, which had no accounts at all.
- **Evidence:** repository-wide search for the address and the password returns
  **no matches** in the working tree. The literals remain in git history from
  `d691022`; the account must still be treated as compromised and its password
  changed wherever it was reused.

#### P0.4 — Appointment booking, end to end

- **Status:** VERIFIED
- **Completed:** 2026-09-07
- **Browser evidence:** signed in as `nile@osool.test`, opened the appointment
  screen for a SUBMITTED application, was offered **128 selectable slots** across
  a month, picked 13:00, gave an attendee and a telephone number, and confirmed.
  The screen answered "Your appointment is booked" with **when** (Monday, 7
  September 2026 at 13:00), **where** (the counter), **who is attending** and
  **what to bring**. A cancel control appeared where there had been none.
  `APPOINTMENT_BOOKED` written to the audit trail at `seq 6316`.
  The clerk's diary for that day then showed the booking — 13:00, the firm's
  Arabic trade name, the purpose, the attendee, the telephone number, status
  *Booked*, and the attendance controls — among 31 appointments.
  The Arabic screen renders right-to-left.
- **Files:** `src/lib/appointments/index.ts`, `src/app/[locale]/appointments/`,
  `src/app/[locale]/application/[id]/appointment/`
- **Verification:** broker sees slots, books one, sees confirmation; clerk sees
  the booking; double-booking refused; cancellation works; both languages.
- **Note:** the code exists and has integration tests. It has never been driven
  through a browser.

#### P0.5 — Register search, end to end

- **Status:** VERIFIED
- **Completed:** 2026-09-07
- **Browser evidence:** the register lists registrations; search by **Arabic
  trade name** finds the firm; search by **registration number** finds it;
  filtering by status works; paging works; the Arabic register renders; and
  public `/verify` answers for a real registration number **with no session**.
- **Files:** `src/app/[locale]/register/page.tsx`, `src/lib/registry/search.ts`,
  `src/app/[locale]/verify/`
- **Note:** this screen is already fully paginated and filtered — search by
  Arabic and Latin name, registration number, status, category, type,
  governorate. It needs verifying, not building.

#### P0.6 — Government workflow, per role

- **Status:** VERIFIED
- **Completed:** 2026-09-07
- **Browser evidence:** REGISTRY_CLERK, EXAMINER, REVIEWER, CARD_ISSUER,
  DATA_MANAGER, FILES_HEAD, AUDITOR, AML_SUPERVISOR, INSPECTOR, ANALYST,
  SYSTEM_ADMIN and BROKER_OWNER each signed in and reached their own screen. A
  broker asking for `/audit` is refused with an explanation rather than an error.
- **Note on the harness:** three roles intermittently report a failure that is
  the **rate limiter working correctly** — 40 sign-ins per 300 seconds per
  address and 8 per 900 seconds per account, and a harness that signs in fifteen
  times in three minutes meets both. Each of the three was confirmed
  individually to sign in and land on its dashboard. The harness now paces
  itself; a run inside 15 minutes of a previous one can still meet the
  per-account budget.

#### P0.7 — Document upload, end to end

- **Status:** VERIFIED
- **Completed:** 2026-09-07
- **Evidence:** a PDF posted to `/api/applications/<id>/documents` as the owning
  broker returned `200` with `sha256`, `sizeBytes`, `version: 2` and
  `supersedes: <previous id>` — content-addressed and superseded, never
  overwritten, as `02-SYSTEM-ARCHITECTURE` requires. Retrieval as the owner
  returned the exact bytes (`200`, `application/pdf`, 69 bytes). Then the
  refusals, each bilingual and each stating what and why:
  · another firm's broker — **403**, "This document belongs to another firm's application."
  · `SYSTEM_ADMIN` — **403**, "Administration is not access. The system
    administrator manages accounts and does not open case files." (REQ-REG-052
    visible at the object level.)
  · no session — **401**.
- **Files:** `src/app/api/applications/[id]/documents/route.ts`,
  `src/lib/storage/`, `src/lib/documents/`
- **Verification:** upload through the browser, persist, retrieve,
  integrity-check, and refuse an unauthorised reader.

---

### P1 — PRODUCTION STABILITY

#### P1.1 — Provision the production database

- **Status:** BLOCKED — needs a database the user creates; no credential may be invented
- **Files:** `prisma/migrations/`, `scripts/db-deploy.mjs`, `CLOSE-THE-DATABASE.sql`
- **Verification:** migrations deploy, seed runs, `/api/health?deep` returns
  `ok`, the workflow can write and read.

#### P1.2 — Deploy current code to production

- **Status:** BLOCKED on P1.1
- **Verification:** production smoke tests against the deployed commit, not the
  Vercel build log.

#### P1.3 — CI actually gates

- **Status:** COMPLETED
- **Completed:** 2026-09-07
- **What changed:** `checks` gained `audit:one-archiver` and `i18n:check`; the
  `database` job gained `npm test` and uploads the test reports as an artifact
  even on failure. Triggers widened from `main` only to every branch — a gate
  that first runs after the merge is not a gate.
- **Files:** `.github/workflows/ci.yml`
- **Finding:** the workflow runs typecheck, lint, `audit:no-deletes`, build,
  migrations, seed and the proofs — but **not `npm test`, not `i18n:check`, not
  `audit:one-archiver`**. The `ci` npm script runs all of them; the workflow was
  never updated to match.

#### P1.4 — Scheduler

- **Status:** COMPLETED — verified locally; needs `CRON_SECRET` set on the deployment
- **Completed:** 2026-09-07
- **What changed:** new `/api/cron/sweep`, authenticated by `CRON_SECRET`
  compared in constant time and refusing everything when none is configured.
  Three schedules in `vercel.json`: reminders daily at 06:00, lifecycle and the
  audit checkpoint at 02:30, signals weekly. No sweep logic lives in the route —
  each is a library function the command line also calls, so
  02-SYSTEM-ARCHITECTURE §10's host-agnostic rule holds and moving off Vercel
  costs one file. The appointment reminder moved out of `scripts/sweep.ts` into
  `src/lib/notifications/reminders.ts` for that reason.
- **Evidence:** no token → **401**; wrong token → **401**; correct token, dry
  run → `200` with `{"reminders":{"ok":true,...},"audit-since":{"ok":true,
  "eventsChecked":23,...}}`.
- **Files:** `vercel.json`, `scripts/sweep.ts`
- **Finding:** `vercel.json` has no `crons` key, so every time-based obligation
  is dormant.

#### P1.5 — Email and storage, proven

- **Status:** NOT STARTED
- **Finding:** local is `EMAIL_PROVIDER=console` and `STORAGE_DRIVER=local`.
  Neither Resend nor S3 has been exercised.

---

### P2 — PRODUCT COMPLETION

#### P2.1 — Application status timeline — **already exists**

- **Status:** NO LONGER RELEVANT — withdrawn after checking the code
- **Why it was proposed:** the roadmap claimed "every transition is recorded and
  nothing renders them". That was wrong, and checking before building is what
  caught it. `src/components/gov/event-trail.tsx` puts the full trail on four
  officer screens, and `src/components/application/review-step.tsx:386` renders
  the same events to the applicant with the actor, the role, the timestamp and
  the reason. Building it again would have duplicated a working feature.
- **What is worth noting instead:** the applicant's timeline names the
  individual officer who took each step. That is likely deliberate — this
  product's whole argument is that a register must be answerable — but it is a
  policy question rather than a technical one, and it has no `REQ-*` behind it.
  Raised, not changed.

#### P2.1b — An officer's view of a registered firm

- **Status:** NOT STARTED
- **Finding:** the register list at `/register` links every row to
  `/verify?number=…` — the *citizen-facing* verification page, which answers one
  question about one number by design. So the Authority's own view of a firm it
  supervises does not exist: an officer cannot see a registration together with
  its applications, its appointments, its documents and its signals.
- **Why this one:** it is the strongest remaining demonstration screen, it is
  assembled entirely from data that already exists, and it is the natural
  destination for a row somebody has just searched for.

#### P2.1c — The INSPECTOR role has no screen

- **Status:** RAISED, not fixed
- **Finding:** `INSPECTOR` has a label, sits in `GOVERNMENT_ROLES`, can be
  provisioned and can sign in — and there is no screen anywhere that admits it.
  `/supervision` permits `AML_SUPERVISOR`, `AUDITOR` and `ANALYST` only, and the
  inspector's own subject matter (`Inspection`, `Finding`) is part of the AML
  cluster that still has no reads and no writes. An inspector signs in and can
  reach nothing.
- **Why it was not fixed:** which screens an inspector may see is a regulatory
  question, and CLAUDE.md rule 3 says a rule with no requirement ID behind it
  does not go into the code. Adding the role to a guard would have been a guess.
- **What was done instead:** the browser harness asserts that an inspector is
  refused **and that the refusal is a proper four-part one**, so the gap is
  visible and the user experience of it is at least correct. It surfaced only
  because this session seeded the first `INSPECTOR` account; before that, no
  account held the role and nothing exercised it.

#### P2.2 — Renewal and amendment applications

- **Status:** NOT STARTED — only `NEW` applications exist

#### P2.3 — AML supervision cluster

- **Status:** DEFERRED — five models with no reads and no writes. Out of scope
  for this session by explicit instruction.

---

### P3 — HARDENING / SCALE

| ID | Task | Status |
|---|---|---|
| P3.1 | Accessibility and mobile measured (axe, viewports) | NOT STARTED |
| P3.2 | `next@16` major upgrade; 6 high advisories accepted in writing | DEFERRED |
| P3.3 | Global audit advisory lock (PERF-2) throughput ceiling | DEFERRED — changes the audit algorithm, needs sign-off |
| P3.4 | Backup and rehearsed restore | NOT STARTED |
| P3.5 | Monitoring and alerting | NOT STARTED |
| P3.6 | Legal-hold officer UI | NOT STARTED |

---

## Decisions taken this session

| Decision | Outcome |
|---|---|

---

## Log

| Date | Entry |
|---|---|
| 2026-09-07 | Session opened. Verified current state against the repository rather than the prior report. Confirmed the queue truncation; **found that broker self-registration does not exist at all**. Roadmap rewritten around demonstrability. |
