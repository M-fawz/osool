# ADR 0001 — Test isolation for year-scoped counters

**Status:** Accepted · 3 September 2026
**Context:** Phase 2, item 1 — the intermittent test failure

## Context

`tests/integration/numbering.test.ts` failed intermittently. Measured on the
development database before any change: **3 failures in 10 runs**, each on a
different year (3469, 3030, and one on a different assertion in the same file).

The cause is not randomness in the code under test. It is the interaction of two
correct decisions:

1. **Nothing is ever deleted** (CLAUDE.md rule 2). The statement-level guards
   from the Phase 0 migrations are installed on the development database too, so
   a test suite cannot tear down after itself. Every `number_series` counter row
   a run creates survives that run permanently.
2. **The fixture drew its "isolated" year at random** from a 900-year range
   (`3000 + Math.floor(Math.random() * 900)`).

Each run burns roughly five of the 900 candidate years — four tests drawing one
each, plus the year-scoping test which uses `base` **and** `base + 1` while
reserving only `base`. The probability that a run draws a year some earlier run
already counted in therefore **rises monotonically with the age of the
database**. On a collision the counter is non-zero and an assertion of `…/0001`
receives `…/0002`.

This is why a fresh database always passed, and why the failure was previously
closed as unreproducible.

## Decision

Replace random selection with **reservation**: `reserveYears(count)` in
`tests/support/fixtures.ts` takes the next block of years above the maximum any
run has ever used, and claims each year with a marker row so a second call
within the same run cannot overlap the first.

Collision becomes impossible by construction rather than improbable, and stays
impossible however many times the suite is run against the same database. The
year-scoping test now reserves both of the years it uses.

Three regression tests encode the invariants the old helper could not have:
a reserved year is never one already counted in, successive callers get disjoint
blocks, and reservation is monotonic.

## Options rejected

**Widen the random range.** Reduces the collision probability without removing
it, and the failure returns as the database ages. It converts a reproducible
defect into a rarer one, which is worse: rarer flakes are the ones that get
closed as unreproducible. Rejected as a delay, not a fix.

**Delete the counter rows between runs.** Forbidden by CLAUDE.md rule 2, and
physically refused by the no-delete triggers. Working around them for tests
would mean the suite no longer runs against the constraints the product actually
has — the guards would then be untested by the very suite that should prove
them.

**An isolated schema or database per test file.** This genuinely designs out the
whole class of shared-fixture accumulation, not just this instance, and remains
the right answer if fixture bleed appears in other suites. Rejected *here* as
disproportionate, and because it works against a deliberate property of the
current design: `fileParallelism: false` exists so that integration files share
one database and contend on the same advisory locks, which is what makes the
concurrency tests meaningful. Isolating each file would remove that contention.
Revisit if a second, unrelated accumulation bug appears.

## Consequences

- The numbering suite is deterministic: **20 consecutive passes**, against 3
  failures in 10 before. Full suite: 74 tests, green on every completed run.
- `number_series` accumulates a few marker rows per run on development
  databases. This is consistent with how the register itself accumulates and
  costs nothing; the rows are confined to years ≥ 3000 and can never collide
  with the register's real counters in the 2020s.
- Any future test needing a pristine year should call `reserveYears` rather than
  inventing its own isolation.

## Evidence

- Before: `3 fail / 10 runs` — years 3469, 3030, plus a unique-constraint
  violation in `the four-digit boundary`.
- After: `20 pass / 20 runs` of the file; `.proof/flake/run-*.txt`.
- Full suite after: 74 passed, repeated runs in `.proof/suite/`.
- Test reports are now persisted to `.proof/test-reports/` (JSON + JUnit) by
  `vitest.config.ts`, so a failure can never again exist only in scrollback.
