# Baseline Truth — Osool

**Established:** 3 September 2026
**Branch:** `chore/checkpoint-uncommitted` (14 commits ahead of `main`)
**Method:** every claim below was produced by running a command or reading the
source at the cited line. Where I reasoned from code without executing it, the
row says **reasoned**, not verified.

---

## 0. The document problem, stated first

**The two prior assessment reports are not in this repository.** The finding IDs
this mission asked me to reconcile — `F-01…F-17`, `SEC-1…SEC-7`, `PERF-1…PERF-5`
— appear nowhere in the working tree, in `docs/`, or in any commit reachable from
`git log --all`:

```
$ grep -rl "F-1[0-7]\|SEC-[1-7]\|PERF-[1-5]" . --include=*.md -I | grep -v node_modules
(no output)

$ git log --all --diff-filter=A --name-only --pretty=format: | grep -iE "assess|review|finding"
docs/PHASE-1-REPORT.md
docs/QA_BUSINESS_REPORT.md      ← neither contains the ID scheme
```

I will not invent rows for findings I have not read. Fabricating `F-05` and
assigning it a status would corrupt the one artefact whose entire value is that
every line in it is traceable.

**What I did instead:** your brief describes fourteen concerns *substantively*,
not merely by ID. Every one of those is assessed below against the code, and I
have added the defects I found on my own. Where you gave me an ID alongside the
description, I have carried it so the two documents can be read side by side.

**What I need from you:** the two reports, if they exist outside the repo. Any
finding described only by an ID I never saw is marked `UNAVAILABLE — source
document not in repository`, and that is the honest status, not a verdict.

---

## 1. The gates, as actually run

All commands run on `chore/checkpoint-uncommitted`, working tree clean.

| Gate | Command | Result | Evidence |
|---|---|---|---|
| Typecheck | `npx tsc --noEmit` | **PASS** | exit 0, zero output |
| Lint | `npx eslint .` | **PASS** | exit 0, zero output |
| Build | `npm run build` | **PASS** | exit 0; all routes emitted, incl. `/api/health`, `/[locale]/supervision`, `/[locale]/register`, `/[locale]/forgot-password`, `/[locale]/reset-password` |
| No-delete audit | `npm run audit:no-deletes` | **PASS** | exit 0 — "No destructive delete found in application code." |
| i18n parity | `npm run i18n:check` | **PASS** | `ar: 858 keys / en: 858 keys / Parity: every key exists in both locales.` |
| Test suite | `npm test` | **FAIL** | `Tests 1 failed | 70 passed (71)`, exit 1 — see §3 |
| Dependency audit | `npm audit --omit=dev` | **FAIL** | `6 high severity vulnerabilities` — see §4 |

Two gates that the previous session's `ci` script believes it runs, and does not:

- **`npm run test:unit` executes zero tests.** `vitest.config.ts:38` defines the
  `unit` project as `include: ['tests/unit/**/*.test.ts']`, and `tests/unit/`
  does not exist. `package.json:17` puts `test:unit` in the `ci` chain, so CI
  currently gates on an empty set and reports success. The 71 real tests are all
  in the `integration` project, which `ci` does not run.

---

## 2. Status of every substantive concern

`CLOSED` = fixed and I verified it · `OPEN` = present and confirmed ·
`PARTIAL` = fixed in one place, not another · `UNVERIFIABLE` = needs a running
environment I have not yet built.

| # | ID | Claim | Status today | Evidence | Confidence |
|---|---|---|---|---|---|
| 1 | F-03/F-04 | Assigned-examiner enforcement lives at call sites, not in `transition()` | **CLOSED** | `src/lib/applications/transition.ts:123` defines `ASSIGNED_OFFICER_ACTIONS` as a table; `:218-231` enforces it inside the `$transaction`, after the `FOR UPDATE` row lock at `:135`. Table-driven, so a future step inherits it. | Verified (read) |
| 2 | F-07 | `submittedUnderRuleSetIds` written empty | **CLOSED** | `src/lib/applications/draft.ts:112` stamps `completeness.ruleSetVersions`, populated by every resolver at `completeness.ts:230,252,270` and returned at `:323`. Prior bug (populated only on refusal) is documented in the comment at `draft.ts:103-109`. | Verified (read) |
| 3 | F-08 | Numbering race + 9,999/year ceiling | **CLOSED** | `src/lib/applications/numbering.ts:73-78` — single `INSERT … ON CONFLICT DO UPDATE … RETURNING "lastValue"` upsert on `number_series`. Integer counter, atomic, no read-then-write. Test `numbering.test.ts` "counts from 9,999 into five digits" passes. | Verified (read + test) |
| 4 | F-09 | Issuance ordering burns numbers / orphans PDFs | **CLOSED (reasoned)** | Delivery is now a third, separate series (`numbering.ts:52`, `Series = 'TEMPORARY' \| 'REGISTRATION' \| 'DELIVERY'`), so the delivery ledger no longer consumes registration numbers. I have not driven issuance end to end. | Reasoned |
| 5 | F-06 / PERF-1 | Audit page re-verifies the whole chain on every load | **CLOSED** | `src/app/[locale]/audit/page.tsx:97` calls `verifyChain({ fromSeq: lowest, toSeq: highest })` — bounded to the displayed window. The comment at `:37-50` states plainly what a window proves and what it does not, rather than implying the stronger claim. | Verified (read) |
| 6 | PERF-2 | Global audit advisory lock is a concurrency ceiling | **OPEN** | `src/lib/audit/index.ts:30` `AUDIT_LOCK_KEY = 8410077`; `:128` takes `pg_advisory_xact_lock` unconditionally on **every** audit write. Since reads are audited too, total system write throughput is bounded by one serialised append. **Mitigating:** public `/verify` writes no audit event, so a public flood does not serialise officer writes — the DoS half of this concern is narrower than stated. The throughput ceiling is real and **unmeasured**. | Verified (read); ceiling unmeasured |
| 7 | — | Rate limiting exists but was never exercised over HTTP | **OPEN (unverified)** | `src/lib/security/rate-limit.ts` — well-designed: database-backed rather than a module `Map` (correct for Vercel's multi-instance model, reasoned at `:6-16`), HMAC-hashed identifiers so the table cannot answer "who has been here" (`:18-26`), windows reset in place rather than deleted (`:28-32`). Never driven over real HTTP. | Read only |
| 8 | SEC-3 | No Content-Security-Policy | **CLOSED (unverified at runtime)** | `next.config.ts:90` `async headers()`, CSP at `:175`. Not yet observed on a live response header. | Read only |
| 9 | SEC-6 | Document object-level authorisation missing | **CLOSED (reasoned)** | `src/lib/documents/access.ts` (177 lines) decides per-object access; wired into `src/app/api/documents/[id]/route.ts` and `.../applications/[id]/documents/route.ts`. `tests/integration/document-access.test.ts` — 9 tests, all passing. | Verified (test) |
| 10 | F-11 | Archive-integrity check documented, not implemented | **OPEN** | `verifyStoredDocument` is exported at `src/lib/storage/index.ts:93` and has **zero callers** across `src/`, `scripts/`, and `tests/`. The control is documented and does not run. | Verified (grep) |
| 11 | F-12 | Printed card hard-codes the 90-day renewal window | **OPEN — worse than reported** | `src/lib/pdf/registration-card.ts:159` computes `validTo − 90×24×60×60×1000`, **and** `:158` states it in Arabic words ("بتسعين يوماً"), **and** `:162` hard-codes the 30-day change-notification window ("خلال ثلاثين يوماً"). Three literals, one of them prose. A decree amendment requires a deployment — CLAUDE.md rule 4. | Verified (read) |
| 12 | — | Pagination coverage across every list | **PARTIAL** | `loadBrokerApplications` now paginates (`queues.ts:178-207`, `take: page?.take ?? DEFAULT_PAGE_SIZE`). **But its only caller passes no page** — `src/app/[locale]/application/page.tsx:73-75` calls it with one argument, discards `total`, and the page reads no `searchParams`. With `DEFAULT_PAGE_SIZE = 50` (`pagination.ts:18`), a broker with >50 applications cannot reach the rest. `register/page.tsx:81` wires it correctly. | Verified (read) |
| 13 | SEC-4 | Six high-severity transitive advisories | **OPEN** | `npm audit --omit=dev` → 6 high, in 3 chains: `deepmerge-ts<8` (stack exhaustion) via `@prisma/config`→`prisma`; `postcss<=8.5.22` (4 CVEs) via `next`; `sharp<0.35` (libvips CVEs) via `next`. Both `next` chains require `next@16.3.4` — a **breaking** major upgrade. | Verified (command) |
| 14 | — | `CLOSE-THE-DATABASE.sql` unapplied; must become provisioning | **OPEN — highest severity** | See §5. Referenced by 5 documents, by **zero scripts**. Not in `package.json`, not a migration, not in any provisioning path. | Verified (grep) |

---

## 3. The intermittent test failure — reproduced and root-caused

The brief asked me not to close this as "could not reproduce" a second time. I
did not have to: **it failed on my first full run**, and it is not intermittent.

```
$ npm test
FAIL  tests/integration/numbering.test.ts > year scoping
      > restarts each January rather than running on from the year before
AssertionError: expected '3023/0002' to be '3023/0001'
Tests  1 failed | 70 passed (71)
```

**Root cause.** `tests/integration/numbering.test.ts:20-23`:

```ts
/** A far-future year, so these tests never touch the live 2026 counters. */
function isolatedYear(): Date {
  const year = 3000 + Math.floor(Math.random() * 900)
  return new Date(Date.UTC(year, 5, 1))
}
```

The year is *randomly hoped* unique, not isolated. Three facts combine:

1. Nothing is ever deleted — the no-delete triggers are installed on the
   development database too — so every `number_series` counter row a run creates
   **persists forever**.
2. Four tests each draw a year, and the year-scoping test consumes **two**
   consecutive years (`base` and `base+1`) while `isolatedYear()` only ever
   reserves one. Roughly five of 900 candidate years are burned per run.
3. On a collision, the counter is already non-zero, so `first` returns `…/0002`
   and the assertion at `:92` fails.

Collision probability therefore **rises monotonically as the development
database ages** — which is exactly why it presents as intermittent, and exactly
why a fresh database always passes and closed it as unreproducible before.

**Measured, 10 consecutive runs of the file on this database:**

| Result | Count | Years that collided |
|---|---|---|
| PASS | 7 | — |
| FAIL | 3 | 3469, 3030, and one on a different assertion |

The third failure landed on a *different* test — `the four-digit boundary`,
whose `db.numberSeries.create(...)` at `:63` hits a unique-constraint violation
when its random year already exists. **One root cause, two symptoms.**

This is precisely the "shared-fixture accumulation across integration tests on
one database" hypothesis in the brief. Confirmed, with the mechanism identified.
The fix belongs in Phase 2 and should design the class out — a per-run unique
year allocator, or an isolated schema per suite — not merely widen the random
range.

---

## 4. Dead-code register

Each of these is exported, and each has **zero callers** across `src/`,
`scripts/`, and `tests/` (verified by grep).

| Symbol | Location | Consequence |
|---|---|---|
| `decryptPii` | `src/lib/crypto/pii.ts:74` | National ID is encrypted on the way in and can never be read back. The cleared-role display path in the vision does not exist. |
| `verifyStoredDocument` | `src/lib/storage/index.ts:93` | The archive-integrity check (F-11). Documented control, never runs. |
| `availableActions` | `src/lib/applications/transition.ts:368` | Intended to drive which actions a screen offers; screens decide independently, so the engine's view and the UI's view can drift. |

Per the brief's own standard — *a documented control that does not exist is
worse than no control* — items 1 and 2 are the consequential ones.

## 4b. Retention controls: named in the constitution, absent from the code

CLAUDE.md rule 2 names three mechanisms: **"Archive, retention lock, legal
hold."** Only one of them is real.

| Control | Column / model | References in `src/` + `scripts/` |
|---|---|---|
| Archive | `archivedAt` | **49** — working |
| Retention lock | `retentionUntil` | **0** |
| Legal hold | `legalHold` column, `LegalHold` model | **0** |

`retentionUntil` and `legalHold` exist on every table in the schema — the Phase 2
migration adds them to each new table as well — and are never read and never
written. Two thirds of the project's stated retention posture is schema only.

## 4c. Unwritten-model register

Seven of 39 Prisma models have zero reads and zero writes:

| Model | Reading |
|---|---|
| `Account` | **Not a defect.** Better Auth writes this through its own adapter, not through `db.account`. |
| `LegalHold` | See §4b — a named control that does not exist. |
| `ComplianceOfficerTenure`, `Inspection`, `Finding`, `Ownership`, `TrainingRecord` | Schema built ahead of the Phase 5 supervision features. Deliberate, not rot — but they are the difference between "a register" and "a supervisor". |

---

## 5. The finding that outranks the rest

`docs/CLOSE-THE-DATABASE.sql` is referenced by **five documents and zero
scripts**. It is not in `package.json`, not a migration, and not in any
provisioning path — it remains remediation that someone must remember, which is
the condition the brief asked to end.

That would be a process defect on its own. What makes it the top item is what
the file says about itself (`docs/CLOSE-THE-DATABASE.sql:9-21`):

> · 34 tables in `public`, row-level security enabled on 0 of them
> · 0 RLS policies exist
> · `anon` and `authenticated` each hold SELECT, INSERT, UPDATE, DELETE,
>   TRUNCATE, REFERENCES, TRIGGER on all 34
> · the PostgREST Data API is enabled on `public`
>
> Confirmed live, not inferred: a single unauthenticated GET with the
> publishable key returned rows from `user`, `session`, `application`,
> `audit_event`, `document` and `party`. The publishable key is by design
> shipped to the browser — it is in the client bundle of every page.

Header, same file: *"Verified against production on 12 August 2026. Nothing here
has been run for you."* `docs/QA_BUSINESS_REPORT.md:274` confirms: *"It has not
been run."*

**I have not re-tested production, and I will not without your say-so** — the
brief forbids pointing anything at a production database, and I am treating a
read against it as your call rather than mine. So the honest status is: *last
confirmed open on 12 August 2026, with no evidence since of it being closed.*

If it is still open, every record in the register — including the audit trail
whose integrity is the product's central claim — is readable, writable, and
**truncatable** by anyone holding a key that ships in the browser bundle. The
no-delete triggers do not save this: `TRUNCATE` is granted, and while the
truncate guard would refuse it, `DELETE`/`UPDATE` on `audit_event` via PostgREST
bypasses every control written in TypeScript.

**Checked, read-only, 3 September 2026 — the project no longer exists.**

```
curl: (6) Could not resolve host: <redacted>.supabase.co
nslookup → *** can't find <redacted>.supabase.co: Non-existent domain
```

The database host in `DATABASE_URL` also returns `Non-existent domain`. Control
tests (`supabase.com` → 200, `example.com` → 200) rule out a local network
fault. Full evidence: `docs/reports/evidence/prod-postgrest-check.md`.

| ID | Status now |
|---|---|
| SEC-1 / F-02 | **SUPERSEDED** — project unreachable, exposure unverifiable |
| F-01 | **OPEN** — no evidence either way about data recoverability |

**This does not clear the defect.** The exposure was never closed; the project
that had it was removed. `CLOSE-THE-DATABASE.sql` is still not part of
provisioning, so **the next database provisioned inherits the same exposure**.
Making it step one of database creation — applied before the application ever
holds credentials, with its verification queries as a documented gate — is now a
fixed requirement of Phase 4, not a proposal.

**And one thing the check found that nothing had reported:** the deployed
application at `osool-cyan.vercel.app` still answers `HTTP 200` on `/` while its
database no longer exists. Nothing alerted. `/api/health` returns `404` because
the health endpoint has never been deployed — the one endpoint that would have
caught this exists only in the repository. The invisible-outage defect is now an
observed fact, not a reasoned risk.

---

## 6. What I have not verified

Stated plainly, because a report that only lists successes is not a report.

- **Anything in a browser.** No screen has been rendered this session. Zero of
  the role × screen × locale matrix is driven. Mobile and tablet remain
  unverified, as they were before.
- **Production's current state** — deliberately, pending your instruction (§5).
- **CSP, rate limiting, and security headers at runtime.** Read in source only.
- **Mail, storage, scheduler.** No local stack exists yet; `docker-compose.yml`
  is not in the repository.
- **Backup restore.** `docs/BACKUP-AND-RECOVERY.md` remains unrehearsed and says
  so on its own first page.
- **The audit chain over full history.** `npm run audit:verify` not yet run.
- **Accessibility.** No axe run, no keyboard pass.
- **Whether `/verify` should audit its reads.** CLAUDE.md rule 5 says read access
  is audited; the public lookup writes no audit event. That may be correct
  (public register data, no personal data disclosed) or a gap. I do not yet know
  which, and `docs/01-LEGAL-REFERENCE.md` needs checking against REQ-DPA-002
  before anyone changes it.

---

## 7. Proposed priority order

Sequence and dependency only, no estimates.

**Gate zero — answer before building anything**

1. **Production exposure** (§5). Your decision: do I verify it, and is
   `CLOSE-THE-DATABASE.sql` applied now? Nothing else matters if the register is
   readable by anyone with the browser key.

**First — the things that are wrong now**

2. The flaky test (§3). Root-caused; design the class out rather than patch the
   symptom. Everything downstream depends on a suite that can be trusted 20 runs
   in a row.
3. Broker list pagination caller (§2 row 12) — a broker silently loses access to
   their own applications past the 50th.
4. `test:unit` gating CI on an empty set (§1) — CI currently reports green
   without running a single test.

**Second — controls that are named but absent**

5. Retention lock and legal hold (§4b) — decide: implement, or strike them from
   the constitution. The present state, claiming both in CLAUDE.md while neither
   exists, is the worst of the three options.
6. `verifyStoredDocument` (§4, F-11) — wire it up or delete it.
7. `decryptPii` (§4) — Phase 5 item; leave dead until the cleared-role display is
   specified, but say so on the not-built list rather than leaving it silent.

**Third — configuration that is currently deployment**

8. F-12, the printed card's three hard-coded windows (§2 row 11). Straight
   violation of CLAUDE.md rule 4, and it is on the artefact a stakeholder holds
   in their hand.

**Fourth — needs the local stack (Phase 4) to prove**

9. Rate limiting over HTTP; CSP on a live response; audit-lock throughput
   measured rather than reasoned (PERF-2).
10. SEC-4 advisories — the two `next` chains need a breaking major upgrade, so
    this is a decision, not a command. My recommendation is in the summary below.

---

## 8. What changed in the working tree before I started

The previous session left **72 changed paths uncommitted on `main`** — 4,558
insertions across 37 tracked files plus ~60 new files, **including the entire
`tests/` directory and `vitest.config.ts`**. The test suite itself was not under
version control.

It is now committed as 14 conventional commits on `chore/checkpoint-uncommitted`,
grouped by concern, with no secrets (`.env`, `.env.local`, `.env.prod.pulled` all
matched by the existing `.env.*` ignore rule; staged diffs scanned for key
material before each commit). Working tree clean; nothing discarded, stashed, or
reset.

**Honest caveat on that history:** the groups are thematic, and the work is one
interdependent body. The branch tip typechecks, lints, and builds; intermediate
commits are not independently buildable and the history is not bisectable. I
chose legible grouping over a single opaque commit, and I am flagging the
tradeoff rather than implying a property the history does not have.
