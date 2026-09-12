# Osool — progress and roadmap

The single source of truth for what is done, what is not, and what is next.
Updated as work happens, not at the end. If context is lost, this file plus
`git log` is enough to resume.

Phases 0–2 (checkpoint, baseline truth, correctness closure) are closed; their
detailed log is kept in `docs/reports/PHASE-0-2-LOG.md`. This file starts from
Phase 3 — making the system demonstrable end to end.

---

## CURRENT STATUS

_Last updated 2026-09-12, end of session._

| | |
|---|---|
| **Branch** | `main` |
| **Session** | 2026-09-07: 11 commits from `71bfc60`. 2026-09-08: 3 commits from `de3341c`. 2026-09-09 and 2026-09-10: work completed but **never committed** — a machine shutdown left it in the working tree. 2026-09-12: that work committed, plus the items below |
| **Tests** | **198 passing / 23 files / 0 failed / 0 skipped** |
| **Full gate** | `npm run ci` **exit 0** — typecheck, lint, no-deletes, one-archiver, i18n, tests, build |
| **Browser** | `npm run qa:browser` **97 passed, 0 failed** against a production build (was 96) |
| **Live server** | `node scripts/qa/live-probe.mjs` **13 passed, 2 failed** — the two failures are the proof it is stale. See P0.16 |
| **i18n** | 914 keys per locale, parity enforced |
| **Local database** | Embedded PostgreSQL 16 on `127.0.0.1:5433`, healthy, **0 failed migrations**. 4,631 users, 3,194 applications, 359 registrations, 389 appointments, 2,017 documents, 6,509 audit events |
| **Local demo** | **Working end to end**, proved in a browser this session. Registration, sign-in with a password reveal, application, upload, register search, public verification, appointment booking and cancellation, all eleven roles, Arabic and English, desktop and phone |
| **Demonstrate from** | **`npm run build && npm start`, not `npm run dev`** — see P0.18. On this machine `next dev` takes 50–160s to compile a route the first time it is opened |
| **Production code** | `main` is current |
| **Production deployment** | `76.13.57.79:3000` is **reachable, rendering, and stale** — it predates `9923e16`, so the credential-in-URL defect is live there. Needs a person with shell access; the commands are in P1.2 |
| **Infrastructure required** | **PostgreSQL 16 and any S3-compatible bucket.** Supabase is not required and never was — see P1.0 |

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

#### P0.9 — A credential form fell back to a GET, putting the password in the URL

- **Status:** VERIFIED
- **Completed:** 2026-09-08
- **Reported as:** "authentication failure on the login page". Authentication
  was never the thing that failed.
- **Files:** `src/lib/hooks/use-hydrated.ts` (new),
  `src/app/[locale]/login/sign-in-form.tsx`,
  `src/app/[locale]/activate/activate-form.tsx`,
  `src/app/[locale]/forgot-password/forgot-form.tsx`,
  `tests/unit/credential-form-safety.test.ts` (new)
- **Finding:** a `<form onSubmit={…}>` carries no `method`, so until React
  hydrates it is a plain HTML form. A click or an Enter in that window performs
  the HTML default — a GET to the current URL with every field appended as a
  query parameter. Reproduced with JavaScript disabled on all three credential
  screens:

  ```
  /en/login?email=clerk%40osool.test&password=<redacted>
  /en/activate?password=…&confirm=…      ← its URL already carries the token
  /en/forgot-password?email=…
  ```

- **Two distinct harms.** The visible one: the page reloads unchanged, which is
  indistinguishable from a rejected password — this is what was reported. The
  invisible one, and the worse: the password is then in the address bar, in
  `history`, in the server access log, and in the `Referer` of whatever loads
  next. Under rule 2 nothing here is ever deleted, so a credential written to a
  log cannot be taken back.
- **Why it survived:** the window is invisible to every check that was in
  place. The HTTP harness never submits a form. The browser harness drives
  Playwright, whose `click` waits for the control to be actionable and so
  always arrives *after* hydration. It is only reachable by a real person
  typing fast, on a cold cache, a slow link, or a development server compiling
  the route on first request — which is exactly a sign-in screen's traffic.
- **What changed:** `method="post"` on all three forms, so a native submission
  puts the fields in the body and never in a URL; and the submit control gated
  on hydration via `useHydrated`, so the native submission is not reachable and
  nobody meets the 405 a real pre-hydration POST to a page route would give.
  Neither half is sufficient alone.
- **Evidence:** before — `FAIL: 3 of 3 forms leak credentials into the URL
  without JavaScript`. After — `PASS: 0 of 3`, confirmed against both `next dev`
  and a production `next start`. The new unit test fails on the three forms as
  they were (6 failures) and passes on the fix.
- **Remaining:** sign-in still requires JavaScript. It always did — the GET
  fallback never authenticated anyone, it only leaked. Making it work without
  JavaScript means a Server Action sign-in and Better Auth's `nextCookies`
  plugin; raised, not taken, because it changes the auth flow and the register
  is mid-demonstration. See P2.

#### P0.10 — Signing in gave no sign that the password had been accepted

- **Status:** VERIFIED
- **Completed:** 2026-09-08
- **Files:** `src/app/[locale]/login/sign-in-form.tsx`,
  `src/app/[locale]/login/page.tsx`, `messages/{ar,en}.json`
- **Finding:** "Checking…" labelled both the credential check and the
  navigation after it, so the one fact the user wants — was I let in? — was
  withheld for the whole second wait. On a cold development server that wait is
  the on-demand compile of `/dashboard`: measured at 12.4s alone, inside a 54s
  first sign-in. A build step wearing the costume of an authentication failure.
- **What changed:** a distinct label once the credentials are accepted
  (`signingIn`, both locales), and a prefetch of `/dashboard` on mount — the one
  navigation whose destination is known before the user acts.
- **Evidence:** button label sequence on a cold server is now
  `+1484ms "Checking…"` → `+33024ms "Opening your dashboard…"` → lands on
  `/en/dashboard`. Warm, the whole sign-in is under two seconds.
- **Not a defect, and worth saying:** all 28 documented demo accounts were
  verified to sign in against the stored hashes, and no rate-limit window was
  open. The credentials were never the problem.

---

#### P0.11 — The password field could not be checked by the person typing it

- **Status:** VERIFIED
- **Completed:** 2026-09-09
- **Files:** `src/components/ui/form.tsx` (`PasswordInput`),
  `src/components/ui/icon.tsx`, `src/components/ui/primitives.tsx`,
  `src/app/[locale]/login/{page.tsx,sign-in-form.tsx}`,
  `src/app/[locale]/activate/{page.tsx,activate-form.tsx}`,
  `src/app/[locale]/signup/{page.tsx,signup-form.tsx}`,
  `messages/{ar,en}.json`
- **Implementation:** one `PasswordInput`, used by all three credential screens.
  Masked by default; an eye control at the end of the field toggles it. The
  control is `type="button"`, so it cannot submit the form it sits in; it
  carries `aria-pressed` as well as an `aria-label`, so a screen reader is told
  the state and not only the next action; it takes both labels as props, so the
  Arabic screen announces Arabic; it is 44px in both axes; and it renders only
  once hydrated, into space already reserved for it, so nothing moves when it
  arrives. No new dependency — `lucide-react` was already the icon set.
- **A bug this shipped with, found in a screenshot and fixed:** the field is
  `dir="ltr"`, because a password beginning with an exclamation mark renders
  with the symbol at the wrong end inside Arabic otherwise. A logical property
  resolves against the element's *own* direction, so `pe-11` on the input padded
  its right on an Arabic screen while the button sat at the page's end, on the
  left — and a revealed password ran straight under the icon. Every assertion
  passed while that was true: the control was visible, on the correct side, and
  worked. The reservation now sits on the wrapper, where the page's direction
  applies, and what reaches the input is physical.
- **Test evidence:** `tests/unit/password-reveal.test.ts`, 10 tests, proved in
  both directions — reverting the sign-in screen to a bare
  `<Input type="password">` fails it; restoring it passes.
- **Browser evidence:** `npm run qa:browser` section 1b, 24 checks, English and
  Arabic: masked to begin with, click reveals, click again hides, the form is
  not submitted by either mouse or keyboard, the control is the next tab stop
  after the field, `aria-pressed` follows the state, the control is on the right
  in English and the left in Arabic, it meets 44px, and — the check that would
  have caught the bug above — the reserved padding is on the same side as the
  control. Plus a tap test at 390px in Arabic.
- **Remaining issue:** none.

#### P0.12 — The queue harness proved paging existed, not that it went deep

- **Status:** VERIFIED
- **Completed:** 2026-09-09
- **Files:** `scripts/qa/browser.mjs` (section 3)
- **Finding:** "paging controls are rendered" would pass for controls that
  render and then return the same fifty rows. The original defect — a hard
  `take: 50` — deserves a check that names ordinals.
- **Implementation:** the harness walks to rows 51, 101 and 500 of the intake
  queue, reads the row sitting at each, and asserts they are distinct records
  rather than the first page served again. It then walks to the **last** row,
  whose number it takes from the total the screen itself reports — which is the
  claim that actually matters: there is no cap.
- **Browser evidence:** rows 51, 101, 500 and 814 (the last) all reachable and
  all distinct.
- **Remaining issue:** rows 4,999 and 5,000 were asked for and **do not exist**.
  The deepest queue the fixture fills is intake, at 814 files. The harness
  prints those two as `n/a` with the real total rather than passing or skipping
  them silently. Seeding five thousand applications to satisfy an ordinal would
  be fixture theatre; the cap is disproved at 814.

#### P0.13 — The appointment harness had quietly stopped booking anything

- **Status:** VERIFIED
- **Completed:** 2026-09-09
- **Files:** `scripts/qa/browser.mjs` (section 5, and the `submitAction` helper)
- **Finding:** the booking step ran only when no booking existed. After the
  first run, `nile` kept the appointment it had been given, the already-booked
  branch was taken every time, and the single most important journey in the
  demonstration was never exercised again. It reported "open slots are offered"
  and moved on.
- **Second finding, worse:** the diary assertion was "the page has more than 200
  characters", against whatever session the previous section happened to leave
  behind. A four-part refusal screen satisfies that comfortably, so the check
  would have gone on passing for a role refused the diary outright.
- **Implementation:** an existing booking is now cancelled first — turning the
  obstacle into the proof that cancellation works — and a booking is then driven
  every run. Added: places-left shown per slot; the confirmation states where as
  well as when; a second booking refused while one is live; and the booking
  looked for in the Authority's diary by walking the days forward until it is
  found, which also exercises the day navigation.
- **A harness bug found on the way:** a Server Action does not navigate, so
  `waitForLoadState('networkidle')` after the click returns before the action
  has even been dispatched. Two runs reported a cancellation as failed while the
  database showed it cancelled, with the harness's own reason written on it.
  Both submissions now go through `submitAction`, which arms the response wait
  before the click.
- **Browser evidence:** 13 checks in section 5, all passing — cancel, book,
  confirm with when, where, who and what to bring, duplicate refused, Arabic,
  and the booking found in the clerk's diary on its day.
- **Remaining issue:** rescheduling exists in the domain
  (`rescheduleAppointmentAction`) and is not driven through the interface here.

#### P0.14 — The server at 76.13.57.79:3000 is serving code from before 8 September

- **Status:** VERIFIED (as a finding). The server is **read-only this session by
  the user's explicit instruction** — no SSH, no deployment, no restart, no
  change to its data. What follows is what it does, not what was done to it.
- **Completed:** 2026-09-10
- **What it is:** a genuinely remote machine, not this one — its address is
  `76.13.57.79`, this machine's public address is `197.50.88.157`, and nothing
  listens on `:3000` locally when the dev server is stopped. It answers
  `/api/health` with `{"status":"ok"}`, `deployment: development`,
  `email: console`, `storage: local`, and a database check that passes in 138ms.
  So: a development-mode Next server, with a working database of its own.
- **How the version was established**, without any build metadata being exposed:

  | Probe | Live server | This repository at `dc1960e` |
  |---|---|---|
  | `<form>` on `/en/login` | `<form class="space-y-5" noValidate>` | `<form method="post" …>` |
  | Reveal control on the password field | absent | present |
  | `/en/signup` | 200 | 200 |

  The missing `method="post"` is decisive. It is precisely what `9923e16`
  ("a credential form must not fall back to a GET before hydration", 8 Sep)
  added, and it is absent — so the deployed tree predates that commit. The
  signup screen is present, so it postdates `5922b0c`. The server is somewhere
  between the two, and is **at least two days and four commits behind `main`**.
- **What that costs, in order of seriousness:**
  1. **The credential leak is live on that server.** Until React hydrates, the
     sign-in form is a plain HTML form with no `method`, so an Enter key or a
     click performs the HTML default — a GET carrying `email` and `password` as
     query parameters, into the address bar, the history, the access log and the
     `Referer` of whatever loads next. This is the defect `9923e16` exists to
     fix and it is still there.
  2. No password reveal, in either language — confirmed by eye in a browser.
  3. Its database holds **4 registrations and an empty intake queue**, against
     359 registrations and 813 submitted applications locally. The staged
     workflow dataset that makes a demonstration worth watching is not on it.
- **What does work there**, driven in a real browser: the login screen renders
  (no blank page), `clerk@osool.test` signs in and lands on the dashboard with
  the URL clean of credentials, `/en/register` lists its four registrations with
  every filter control, `/verify/2026%2F0001` answers signed out, and Arabic is
  correct — `/login` is the Arabic screen at `<html lang="ar" dir="rtl">`,
  because Arabic is the unprefixed default locale.
- **Conclusion:** the server proves the application runs on a machine that is
  not this one, and is **not the right thing to present from** — it is behind,
  it carries a credential defect that `main` has already fixed, and its register
  is nearly empty. Present from local. Updating it needs an access path the user
  does not currently have.

#### P0.15 — Two browser-harness failures that were the harness, not the product

- **Status:** VERIFIED
- **Completed:** 2026-09-10
- **Files:** `scripts/qa/browser.mjs`
- **Finding 1 — `ar: the reveal control is on the screen`.** The single check
  that failed while its own eleven neighbours passed: in the same run and the
  same page, clicking the control revealed the password, it sat on the left, it
  met the touch minimum, and the keyboard drove it. A control cannot be operated
  and absent at once. The assertion was `await eye.isVisible()`, sampled once
  and immediately; the control is deliberately not rendered until the page has
  hydrated, so the line raced hydration rather than testing it, and every later
  assertion passed because Playwright's auto-waiting gave hydration the time
  this one did not. `networkidle` does not help — it says the transport is
  quiet, not that React has attached.
- **Finding 2 — two roles "could not reach" their screens.** `AML_SUPERVISOR`
  timed out on `/en/supervision`; `ANALYST` reached the same route seconds
  later. `SYSTEM_ADMIN` timed out on `/en/admin/users`. `next dev` compiles a
  route on the first request that asks for it, and Playwright's default
  navigation timeout is 30s — so the first visitor to a heavy screen paid for
  the compilation, exceeded the budget, and the second inherited a warm route
  and passed. Read literally the run reported that one role could reach a screen
  and another could not, which would be a segregation-of-duties defect. It was a
  cold cache.
- **What changed:** the reveal check waits for the control (15s) instead of
  sampling it, and the default navigation timeout is raised to 90s with the
  reason written down. Both were raised, not removed — a control that never
  appears and a route that never answers still fail the run.
- **Product verification, separately, by hand in a browser**, because a harness
  fix must not be the evidence that the thing it tests works: on the Arabic
  sign-in screen the field is masked, the control sits at the field's left, one
  click reveals `!NotARealPassword123` with the `!` at the correct end, the icon
  changes to eye-off, the form does not submit, and the text stops before the
  icon. English is the mirror of that, control on the right.

#### P0.17 — The harness kept failing on the compiler and blaming the product

- **Status:** COMPLETED
- **Completed:** 2026-09-12
- **Files:** `scripts/qa/browser.mjs`
- **Severity:** it was not a product defect, but it was worse than one in a
  specific way — it produced **false reports about the product**, twice about
  segregation of duties, which is the thing this register exists to prove.
- **Finding 1 — the 90-second budget was set on one page out of five.** P0.15
  raised `setDefaultNavigationTimeout(90_000)` after `/en/supervision` timed
  out on a cold route. It was written on `page`, the only page that existed at
  the time. The harness goes on to create **four more** contexts — the signed-out
  visitor, the booking broker, a second broker, the phone — and each one
  silently kept Playwright's 30-second default. The run then died exactly the
  way P0.15's own comment says it must not: `/en/verify` was cold, the visitor
  context gave it 30 seconds, and the harness aborted **after** section 4 —
  so sections 5, 6 and 7 never ran at all.
- **Fix 1:** the budget moved to a `newContext()` helper that every context now
  goes through, so it applies to every page opened from one, including a page
  added later by somebody who never reads the comment.
- **Finding 2 — raising budgets was losing the race slowly.** With the visitor
  fixed, the next run failed on `CARD_ISSUER reaches /en/issuance` at the
  60-second `waitForURL` inside `signIn`, and then aborted on `/ar/signup` at
  the new 90-second navigation budget. Measured directly: **`/en/issuance`
  takes 65 seconds to compile from cold** — five seconds past the budget. Three
  runs, three different doors, three different numbers.
- **Why raising them again would have been wrong:** each number would have to
  exceed the worst cold compile on the slowest machine that will ever run this,
  and nobody knows that number. Worse, every one of these failures **named a
  role and a screen**: read literally, the run said `CARD_ISSUER` could not
  reach issuance while `DATA_MANAGER` could — which is the shape of a real
  authorisation defect, and is what someone reading the log would have
  reported.
- **Fix 2 — the harness now takes its own advice.** `DEMO-SCRIPT.md` has always
  told a presenter to warm the routes before presenting, for precisely this
  reason. A new section 0 requests all 26 routes the run will visit, once, with
  a 180-second budget, before any assertion exists to be distorted. It uses
  `request.get` rather than `goto` — the compile happens on the server, so
  there is nothing to render — and it is skipped entirely against a production
  build, where there is nothing to compile.
- **What it deliberately does not do:** assert anything, or swallow anything
  that matters. It ignores status codes because most of these routes correctly
  answer 307 to a signed-out visitor. A route that is genuinely broken still
  fails its own assertion later, in the section that cares, against the budget
  it always had. What changed is only that the budget is spent on the product
  instead of on the compiler.
- **One thing that was *not* a defect:** the run appeared to "exit 0" after
  crashing. It does not — `run().catch()` exits 2, and it did. The 0 came from
  `tail` at the end of the pipeline the output was read through.

#### P0.18 — Demonstrate from a production build; `next dev` is unusable on this machine

- **Status:** VERIFIED
- **Completed:** 2026-09-12
- **Files:** `docs/DEMO-SCRIPT.md`
- **How it surfaced:** while proving P0.17. With the warm-up added, the harness
  still could not finish against `next dev` — and the server log says why, in
  its own words:

  ```
  ✓ Compiled /[locale]/signup in 162.4s (2169 modules)
  GET /en/application 200 in 76715ms
  GET /en/audit 200 in 77812ms
  ```

  The warm-up measured the same thing across 26 routes: **480 seconds** to
  compile them all, with `/en/admin/users` alone taking **122s** and
  `/en/issuance` **75s**. Two harness runs also produced a failure each —
  `CARD_ISSUER reaches /en/issuance` and `SYSTEM_ADMIN reaches /en/admin/users`
  — and **both pass against a production build**, which is the proof that
  neither was a product defect.
- **What it is:** the development server compiles on demand and this machine is
  slow enough that the compile dominates everything. It also degrades as it
  runs: the dev worker was measured at **1,041 MB** before it stopped answering
  at all, and any file written anywhere in the project — a note in this very
  document — invalidates its watcher and makes it recompile.
- **What changed:** `DEMO-SCRIPT.md` now opens with the production build as the
  way to present, and explains the one thing that is genuinely different:
  in development the sign-up screen prints the activation link on the page,
  and a production build withholds it on purpose, because that link is a bearer
  token for the account. The link is still shown — in the terminal running the
  server, in a bordered box from the `console` email driver, which is arguably a
  better thing to show an audience anyway: *this is the email the Authority
  would have sent.*
- **The numbers that matter:** against the production build the same harness
  runs **97 passed, 0 failed**, and no route takes longer than a moment.

#### P0.16 — The live server, re-proved from the outside, and a probe that can repeat it

- **Status:** VERIFIED (as a finding). The server remains **read-only** — nothing
  was written to it, no session was created on it, no form was submitted.
- **Completed:** 2026-09-12
- **Files:** `scripts/qa/live-probe.mjs` (new), `scripts/qa/accounts.mjs` (new)
- **Why it was done again:** P0.14 established the deployment was stale on
  10 September by hand. A finding established by hand decays — the next person
  to ask "is it current yet?" has to redo the whole investigation. This turns it
  into one command.
- **What the probe is careful not to do.** `browser.mjs` proves the product by
  using it: it submits applications, books and cancels appointments, and signs in
  as eleven roles. Every one of those is a write, and under rule 2 nothing this
  product writes can be removed afterwards. Pointing it at a deployment that is
  not ours to seed would leave permanent fixture data in it. So the probe reads
  public pages, reads headers, and stops — and prints, at the end, the list of
  things it deliberately did not test, so a green run is never mistaken for a
  full one.
- **How a version is established without any build metadata:** not by asking the
  server what it is — a stale build reports the version it was built from — but
  by looking for the *fingerprints* of specific commits in the markup it sends.

  | Fingerprint | Commit it proves | 2026-09-12 |
  |---|---|---|
  | `<form method="post">` on `/en/login` | `9923e16`, 8 Sep | **absent** |
  | A `button[aria-pressed]` on the password field | the reveal, uncommitted until today | **absent** |
  | `script-src` carries `'nonce-…'` | `f3daea8`, the blank-page repair | present |

- **Result: 13 passed, 2 failed.** The two failures are the two fingerprints,
  and they are the finding rather than a defect in the probe.
- **What is healthy there:** every public page renders text rather than a blank
  screen, `/api/health` reports its own database reachable in 4ms, `/ar/verify`
  is `dir="rtl"` and `/en/verify` is `dir="ltr"`, and there were **no console
  errors and no failed or 5xx requests** across the pages visited.
- **Two things the probe added that P0.14 did not have:**
  1. `/en/register` redirecting to `/en/login` there is **correct**, not a
     defect. `src/app/[locale]/register/page.tsx` calls `guard()` — the register
     list is the officials' view; `/verify` is the public one. Worth recording
     because a 307 on a register route reads like a fault at a glance.
  2. `script-src` carries `'unsafe-eval'`, and `src/middleware.ts:78` only adds
     that when `NODE_ENV === 'development'`. Together with the health endpoint
     reporting `deployment: development`, that is two independent signals that
     **the host is running a development server, not a production build.**
     Consequences: no production build optimisation, verbose errors reachable by
     a visitor, and `'unsafe-eval'` in the policy on a public address.
- **Unchanged and still the headline:** the credential-in-URL defect `9923e16`
  fixes is **live on that server**. Until React hydrates, its sign-in form has no
  `method`, so Enter performs a GET carrying the password into the address bar,
  the history, the access log and the next request's `Referer`.

---

### P1 — PRODUCTION STABILITY

#### P1.0 — What this product actually requires of a host, and what it does not

- **Status:** VERIFIED
- **Completed:** 2026-09-12
- **Why it was asked:** the roadmap, `.env.prod.pulled` and P1.1 all speak of a
  Supabase project, and that has been read as "Osool needs Supabase". It does
  not, and the difference matters: it is the gap between waiting on one vendor's
  account and being able to stand the register up on any PostgreSQL in the
  country — which, for a government register, is not a small distinction.
- **How it was established:** by looking for the coupling rather than for the
  name. There is **no Supabase package in `package.json`** — no `@supabase/*`,
  no `postgrest`, no `gotrue`. Supabase appears in exactly three places in the
  whole source tree, and all three are comments naming it as an *example*:
  `src/lib/env.ts:84` cites its 6543 as one transaction-mode pooler among
  others (PgBouncer, Neon), `src/lib/env.ts:146` cites its Storage as one
  S3-compatible endpoint, and `src/app/api/health/route.ts:11` uses a dead
  Supabase project as the illustration of why the health check is deep.
- **What the product is actually bound to:**

  | Dependency | Bound to | Satisfied by |
  |---|---|---|
  | Database | **PostgreSQL 16**, through Prisma | any PostgreSQL — managed or self-hosted. `DATABASE_URL`, plus `DIRECT_DATABASE_URL` only if the first is a transaction-mode pooler, because migrations cannot run through one |
  | Object storage | **any S3-compatible endpoint**, through `@aws-sdk/client-s3` | AWS S3, MinIO, Ceph, R2, Supabase Storage — `S3_ENDPOINT` with `forcePathStyle`, or none for AWS proper |
  | Authentication | **Better Auth, against the same PostgreSQL** | nothing external. There is no identity provider to procure |
  | Email | a driver, not a vendor | `resend` in production, `manual` or `console` otherwise |
  | Scheduler | an HTTP caller with a shared secret | `vercel.json` crons, or cron/systemd calling `/api/cron/sweep` |

- **Conclusion:** **Supabase is optional, and is only ever a PostgreSQL host and
  an S3-compatible bucket.** No Supabase-specific service is used — not its
  auth, not its realtime, not its edge functions, not its client library. A
  plain PostgreSQL 16 with any S3-compatible bucket is sufficient and complete.
  Nothing in the code has to change to move off it; P1.1 needs *a database*, not
  *that* database.

#### P1.0b — The local database, inspected rather than assumed

- **Status:** VERIFIED
- **Completed:** 2026-09-12
- **Files:** `scripts/qa/accounts.mjs` (new)
- **Why a script:** "the database is fine" is the kind of claim that is made
  from memory. This asks it — over `pg` rather than through Prisma, so it still
  answers on a day the application will not start, which is exactly when the
  question gets asked.
- **Structural health:** **0 failed or unfinished migrations** — every row in
  `_prisma_migrations` has a `finished_at` and none has a `rolled_back_at`. The
  four tables the workflow depends on all answer. Embedded PostgreSQL 16 on
  `127.0.0.1:5433`.
- **Contents:** 4,631 accounts · 3,194 applications · 359 registrations ·
  389 appointments · 2,017 documents · 6,509 audit events · 55,030 notifications.
  Applications reach every stage the workflow defines: 1,386 `DRAFT`,
  813 `SUBMITTED`, 358 `ACTIVE`, 322 `UNDER_EXAMINATION`, 202 `UNDER_REVIEW`,
  46 `APPROVED`, 36 `AWAITING_COMPLETION`, 28 `AWAITING_PAYMENT`, and one each of
  `CARD_ISSUED`, `UNDER_INTAKE` and `REJECTED`. Every stage has at least one file
  to open, which is what makes the walkthrough demonstrable.
- **Test residue, documented and deliberately left alone.** Of the 4,608 `.test`
  accounts, roughly 4,560 are integration-test fixtures in two shapes:
  `test.broker_owner.<hex>@osool.test` from the load and pagination fixtures, and
  `<role>.<hex>@osool.test` from per-run role fixtures. They are harmless to a
  demonstration and **must not be cleared**: rule 2 admits no deletion, the audit
  chain is hash-linked over the events that created them, and a truncate would
  break the chain to make a count look tidy. The named accounts a person actually
  signs in as are the ones without a hex suffix.
- **One detail worth knowing before a walkthrough:** the load fixtures have no
  credential row at all (`password: NONE`), so they cannot sign in even by
  accident. The `<role>.<hex>` fixtures do have passwords, and several
  `examiner.<hex>` accounts are `SUSPENDED` and several `broker.<hex>` accounts
  are `PENDING_ACTIVATION` — states their tests put them in. None of that touches
  the named demonstration accounts, every one of which is `ACTIVE`, verified, and
  has a password set.

#### P1.1 — Provision the production database

- **Status:** BLOCKED — needs a database the user creates; no credential may be invented
- **Files:** `prisma/migrations/`, `scripts/db-deploy.mjs`, `CLOSE-THE-DATABASE.sql`
- **Verification:** migrations deploy, seed runs, `/api/health?deep` returns
  `ok`, the workflow can write and read.

#### P1.2 — Deploy current code to production

- **Status:** BLOCKED — not on P1.1 any more, and not on anything in this
  repository. `76.13.57.79:3000` already has a working database of its own
  (`/api/health` reports it reachable in 4ms). What is missing is **shell access
  to that machine**, which nobody working in this repository has.
- **Verification:** production smoke tests against the deployed commit, not a
  build log.

##### What the person with access to `76.13.57.79` needs to run

Five commands, in this order, in the directory the application is served from.
Nothing here needs a decision — if any step fails, stop and report the output
rather than working around it.

```bash
git fetch origin && git checkout main && git pull            # 1. current code
npm ci                                                       # 2. exact lockfile
npx prisma migrate deploy                                    # 3. schema
npm run build                                                # 4. production build
# 5. restart the process however it is supervised there
#    (pm2 restart <name> · systemctl restart <unit> · docker compose up -d --build)
```

**Step 4 matters more than it looks.** That server is currently running a
**development** server — two independent signals say so (P0.16). A development
server on a public address is slower, returns verbose errors to visitors, and
carries `'unsafe-eval'` in its Content Security Policy. `npm run build` followed
by `npm start`, with `NODE_ENV=production` in its environment, is what it should
be running.

##### How to confirm it worked, from anywhere

```bash
node scripts/qa/live-probe.mjs                 # defaults to that host
QA_LIVE=http://<host>:<port> node scripts/qa/live-probe.mjs
```

It must report **15 passed, 0 failed**. The two checks that currently fail are
the fingerprints of the missing commits; when they pass, the deployment is
current. If `deployment environment reported` still says `development`, step 4
or the process environment did not take.

##### Why this is not optional

The credential-in-URL defect (P0.9) is **live on that server today**. Until this
deployment happens, every sign-in attempt made there before the page finishes
hydrating puts the password in the URL, the browser history, and the server's
own access log.

#### P1.2b — `npm ci` was failing on production before the database was ever reached

- **Status:** COMPLETED — this blocker is removed; promotion still needs P1.1
- **Completed:** 2026-09-09
- **Files:** `package-lock.json`
- **Finding:** every production deployment since the one 28 days ago has ended
  in `Error`, and this roadmap recorded the cause as the missing database. The
  build log says otherwise: it never got that far. `npm ci` refused to install
  at all — it can only install when `package.json` and `package-lock.json` are
  in sync, and they were not, over transitive `@emnapi` WASM bindings.
- **Why it was worth finding:** it was hidden behind a real blocker. Had the
  database appeared, the deployment would still have failed, and the obvious
  explanation would have been the wrong one.
- **What changed:** `npm install --package-lock-only`. Nothing in
  `package.json` moved; the diff is transitive `@emnapi` packages only.
- **Verification:** `npm ci --dry-run` now resolves the tree cleanly, where it
  previously exited `EUSAGE`.
- **Remaining issue:** the deployment still cannot be promoted, now for the
  original reason alone — `prisma migrate deploy` has no database to reach.

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
| Commit the 2026-09-09/10 work rather than redo it | The shutdown left two sessions' work uncommitted but complete. Verified against the gates first — 198 tests, 97 browser checks — then committed as it stood |
| Do not run the writing harness against `76.13.57.79` | It submits applications and books appointments. Rule 2 means nothing it wrote could be removed from a register that is not ours to seed. A read-only probe was written instead |
| Warm routes rather than raise timeouts again | Three runs, three different routes, three different budgets. `/en/admin/users` alone compiles in 122s, so no budget was ever going to be large enough |
| Present from a production build | `next dev` on this machine compiles screens in 50–160s. The only thing lost is the on-page activation link, which the server terminal prints anyway |
| Leave the test residue in the database | ~4,560 fixture accounts. Clearing them would break the audit chain to make a count look tidy, against rule 2 |
| Do not add the INSPECTOR screen | Still no `REQ-*` behind which screens that role may see. Rule 3 — raised, not guessed |

---

## Log

| Date | Entry |
|---|---|
| 2026-09-07 | Session opened. Verified current state against the repository rather than the prior report. Confirmed the queue truncation; **found that broker self-registration does not exist at all**. Roadmap rewritten around demonstrability. |
| 2026-09-08 | The reported login failure was a pre-hydration GET fallback putting credentials in the URL, not an authentication defect. 28 of 28 accounts verified against their stored hashes. |
| 2026-09-09 | Password reveal on all three credential screens, with an RTL padding bug found in a screenshot and now guarded. Queue paging proved to row 814. The appointment harness was silently skipping the booking it existed to prove; it now cancels, books, and finds the result in the Authority's diary. Production deployment unblocked one layer: `npm ci` had been failing on a stale lockfile. 198 tests, 96 browser checks. |
| 2026-09-10 | The live server established as stale from the outside, without touching it. Two browser-harness failures found to be the harness rather than the product. |
| 2026-09-12 | Resumed after a shutdown that left two sessions' work uncommitted. Verified it rather than redoing it: 198 tests, `npm run ci` exit 0. Live server re-proved stale and the probe made repeatable. Three harness defects fixed — a timeout set on one page out of five, budgets losing a race against a 122-second compile, and a run that aborted four sections early. **97 browser checks, 0 failed**, against a production build. Supabase established as not required. Work committed and pushed. |
