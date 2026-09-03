# ADR 0002 — One PostgreSQL schema per test run

**Status:** Accepted · 3 September 2026 · supersedes part of [ADR 0001](0001-test-year-isolation.md)
**Context:** Phase 2 — a second fixture-accumulation failure

## Context

ADR 0001 fixed a flaky numbering test and recorded a condition for revisiting
the decision not to isolate the database: *"Revisit if a second, unrelated
accumulation bug appears."*

It appeared during the twenty-run verification of that very fix.

`tests/integration/notifications.test.ts:140` asserts that a broker is told
their application arrived. It **passed on runs 1–15 and failed on 16, 17 and
18**, and then failed 5 times out of 5 when re-run on its own. It is not flaky.
It crossed a threshold and stayed on the far side of it.

**Mechanism.** Role-addressed notices go to every officer holding the role —
correct behaviour, since a file waiting at intake belongs to whoever is on the
counter. The fixtures create officers and, because nothing is ever deleted,
those officers accumulate. Measured on the development database at the moment of
failure:

```
  1865 BROKER_OWNER
   907 EXAMINER
   603 REGISTRY_CLERK      ← the relevant one
   280 REVIEWER
  ...
  TOTAL USERS: 4284
```

One submission therefore pushed **603** clerk notices into the capture driver's
**500**-message ring buffer, which silently `shift()`ed the oldest away — and the
broker's own notice is the one sent *first*. The assertion became false, and
nothing in the failure output pointed at the cause.

Two distinct defects, then:

1. **The test double silently discarded the evidence under assertion.** A
   capacity limit that drops data without saying so turns a resource problem
   into a wrong answer.
2. **Fixture accumulation crosses thresholds.** The numbering flake was the same
   cause with a different mechanism. There is no reason to think 500 messages
   was the last threshold in the suite.

Note what is *not* a defect: `officersHolding` filters `status: 'ACTIVE'` and
`archivedAt: null` (`src/lib/notifications/recipients.ts:62-71`), so production
fan-out is bounded by currently-serving officers. This is a test-environment
artifact, not a production bug.

## Decision

**One fresh schema per run, migrated and seeded, dropped afterwards.**
`tests/setup/global.ts`, wired as `globalSetup` on the integration project.

Per **run**, not per file. `fileParallelism: false` exists so integration files
share one database and contend on the same rows and advisory locks — that
contention is what makes the concurrency tests mean anything. A schema per file
would remove it. A schema per run keeps contention *inside* a run and removes
accumulation *between* runs, which is the combination actually wanted.

The capture driver no longer drops anything: it holds every message and throws
with a diagnostic if it ever reaches an unreasonable ceiling. A test double must
never quietly discard what a test is about to assert on.

Dropping the run's schema is not a breach of CLAUDE.md rule 2. It removes
scaffolding the run created, not records. The delete and truncate guards are
migrated *into* the test schema and are in force for every test — a test that
tries to delete a row still fails, exactly as production would. Teardown is
guarded on the `osool_test_` prefix, so nothing outside it is reachable.

## Options rejected

**Raise the capture buffer limit.** Moves the threshold without removing it, and
leaves the accumulation that will find the next one. This is the same mistake as
widening the random year range, which ADR 0001 already rejected.

**Assert against the `notification` table instead of the mail buffer.** Would fix
this one test and leave the class intact — and the durable record is the wrong
thing to assert on for a question about what was *sent*.

**A schema per test file.** Isolates more, but destroys the shared-lock
contention that the concurrency tests depend on. Rejected for the same reason
ADR 0001 rejected it; the per-run granularity gets the isolation without the
loss.

**Periodically clean the development database by hand.** Turns a designed
property into a chore someone must remember, which is the failure mode this
whole mission exists to remove.

## Consequences

- **20 consecutive full-suite runs, 78 tests, all green** — the release-gate
  requirement, met and reproducible.
- **The suite got 2.7× faster**: 107s → 40s. It was spending most of its time
  fanning notices out to 603 accumulated clerks and writing a `notification` row
  for each.
- The suite no longer degrades with age, so a 5,000-row fixture can be seeded
  for the pagination proof without poisoning later runs.
- Cost: migrate + seed on every run, about 12s of the 40.
- Requires `prisma migrate deploy` to be runnable from the test process. CI must
  therefore have the migration toolchain available, not only a built app.
- ADR 0001's `reserveYears` helper stays. It is still the correct way to ask for
  a pristine year, and it now cannot collide at all.

## Evidence

- Failure was permanent before the change: 5 of 5 re-runs failed.
- `REGISTRY_CLERK` count 603 against a 500-message buffer — the arithmetic of
  the failure, confirmed by direct query.
- After: `.proof/suite2/run-1..20.log`, each `Tests 78 passed (78)`.
- Teardown verified: zero `osool_test_*` schemas remain after 20 runs.
