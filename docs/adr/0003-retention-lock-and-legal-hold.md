# ADR 0003 — Retention lock and legal hold, and one writer for `archivedAt`

**Status:** Accepted · 3 September 2026
**Context:** Phase 2 — two of the constitution's three retention controls did not exist

## Context

CLAUDE.md rule 2 names three operations: **archive, retention lock, legal
hold.** 02-SYSTEM-ARCHITECTURE §7 defines what each does. Measured in the code
before this change:

| Control | Column / model | References in `src/` + `scripts/` |
|---|---|---|
| Archive | `archivedAt` | 49 — working |
| Retention lock | `retentionUntil` | **0** |
| Legal hold | `legalHold` column, `LegalHold` model | **0** |

Both columns existed on every table — the Phase 2 migration adds them to each
new table too — and were never read and never written by anything. Two thirds of
the project's stated retention posture was schema.

That is worse than not having them. Everyone downstream, including the two prior
assessments and anyone selling this system, reads the constitution and the
schema and reasonably concludes the controls are there.

Two things were **already right** and are not changed here:

- The `RETENTION` rule set was seeded and correct: six record classes with six
  distinct clocks, including row د's open end and a note that REQ-AML-021 means
  this platform holds no STR content. Rule 4 was already satisfied for the data.
- The `LegalHold` model was well shaped — polymorphic, reason required on
  placement, `liftedAt`/`liftedReason` rather than deletion.

What was missing was code that consumed any of it.

## Decision

`src/lib/retention/` implements the three operations against the existing rule
set and model.

**1. Retention is computed, never assumed.** `retentionEligibility()` resolves
the `RETENTION` rule set `asOf` the decision date and derives the eligibility
date from the class's own clock. Nothing hard-codes five years.

**2. The open-ended class never gets a computed date.** REQ-AML-030 row د is
"five years **or until a final decision or judgment is issued, whichever is
longer**". `eligible` is `false` for that class permanently, however long has
elapsed, and the refusal says a release from the competent authority is
required. Returning a date there would present an open legal obligation as a
settled one — an indicative requirement rendered as a computable test, which is
the specific failure the brief warns against.

**3. A legal hold beats an elapsed retention period.** §7 says a held record
cannot be archived *at all, regardless of date*, so the hold is checked first
and wins outright.

**4. Placing and lifting both require a written reason and are audited.** A hold
nobody can explain cannot be reviewed, and is indistinguishable from a mistake
once its author leaves. Lifting does not delete the hold; it stamps
`liftedAt`/`liftedReason`, so the register can always answer why a record
stopped being held.

**5. `archive()` is the only writer of `archivedAt`,** enforced by
`npm run audit:one-archiver` in the CI chain. This is the same shape as the
one-writer rule for `application.status`, adopted for the same reason F-03/F-04
existed: a control that lives at the call sites is a control that will be
forgotten at one of them. Retention lock and legal hold are only real if they
cannot be walked around by a direct `archivedAt: new Date()`, which would look
entirely unremarkable in review.

## Options rejected

**Strike the two controls from CLAUDE.md.** Honest, and much cheaper. Rejected
because REQ-AML-030 and REQ-AML-031 are real obligations on the supervised
population, and a supervisor's own system failing them is not a defensible
position in front of the customer this is being sold to.

**Enforce in the database with triggers, as the delete guard does.** Attractive
— it is the strongest possible enforcement — but a trigger cannot produce the
four-part bilingual refusal that CLAUDE.md requires, and the officer would get a
constraint violation. The existing pattern for REQ-REG-052 is the right
precedent: the check lives in code so the person gets an explanation, and the
database backs it where a constraint can express the rule. A trigger on
`archivedAt` remains a reasonable second layer to add later.

**Compute an eligibility date for row د anyway, flagged as provisional.** A flag
on a date is not read as strongly as the absence of a date. Refusing to produce
one is the only version that cannot be misread downstream.

## Consequences

- Retention lock and legal hold exist, are server-enforced, are audited, and
  refuse in both languages with all four parts.
- `archivedAt` is written in exactly one place; a stray write fails CI.
- The only existing archive path — an applicant removing a contract line from a
  draft — now routes through `archive()`. It passes **no** retention class,
  deliberately: none of the six clocks has started on an unsubmitted draft,
  because there is no relationship to have ended.
- Nothing yet *places* a hold from a screen. The operations exist and are
  tested; the officer-facing UI is Phase 5, and it goes on the not-built list
  rather than being implied.

## Evidence

- `tests/integration/retention.test.ts` — 12 tests: the clock reads the rule
  set, the open-ended class never becomes eligible, a hold beats an elapsed
  period, a reason is required both ways, the hold row survives lifting, both
  events reach the audit trail, and `archive()` refuses **before** it writes.
- `npm run audit:one-archiver` found the single direct write on its first run
  and passes now that it is routed.
- Full chain green: 110 tests across 15 files, build succeeds.
