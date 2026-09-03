# ADR 0004 — Audit chain verification cost, and the growth plan for `audit_event`

**Status:** Accepted · 3 September 2026
**Context:** Phase 2 — "the auditor's only screen must not be the first one to break"

## Context

The audit trail is the product's central claim. It is also the only table that
grows with *use* rather than with the size of the register, because this system
audits reads as well as writes (REQ-DPA-002). Three costs scale with it, and
they scale differently.

**Measured on the development trail, 3 September 2026:**

| Fact | Value |
|---|---|
| Events | 6,257 |
| Table size (incl. indexes) | 7.1 MB |
| Average row | ~1,190 bytes |
| Full chain verification | 6,255 events in 1,007 ms |
| Per event | ~161 µs |
| Read events vs write events | 181 READ / 6,076 WRITE |

The read/write ratio is the one number here that is **not** representative. This
trail was produced almost entirely by test fixtures and proof scripts, which
write constantly and read almost nothing. A register in service inverts it: an
examiner opening a file, a supervisor scanning a queue, and an auditor paging
the trail are all reads, and all audited. Plan for reads to dominate.

Extrapolating the verification cost alone:

| Events | Full verification |
|---|---|
| 10⁴ | ~1.6 s |
| 10⁶ | ~2.7 min |
| 10⁷ | ~27 min |

## Decisions

### 1. The screen verifies its window — already done, kept

`src/app/[locale]/audit/page.tsx:97` verifies only the page it displays,
anchored to the real hash of the row before it. Opening the audit screen used to
re-hash the entire trail. The page states in words which of the two checks it
performed, rather than implying the stronger one.

### 2. Verification from a checkpoint, for the frequent run

`verifyChainSince()` finds the most recent `AUDIT_CHAIN_VERIFIED` event, confirms
the stored hash at that sequence still matches what the checkpoint recorded, and
verifies forward from there. Observed on the development trail:

```
first run  (no checkpoint)   FULL    6,255 events   993 ms
second run (from 6255)       WINDOW      1 event    264 ms
```

The checkpoint is an ordinary audit event, deliberately: no new table, it
inherits the append-only guarantees of the trail, and moving one is itself an
audited act.

**What it proves, and what it does not.** It proves nothing has been altered
*since* the checkpoint. It does **not** prove the trail before it is sound —
someone who altered an old event without recomputing every hash after it leaves
the stored hash at the checkpoint untouched, so the checkpoint still matches and
the incremental run still passes. This is asserted as a test
(`audit-checkpoint.test.ts`, "what a checkpoint cannot prove"), which shows the
incremental check passing and the full walk failing on the same tampered data,
so the narrow guarantee can never be quietly sold as the broad one.

**Therefore the full sweep does not go away.** `npm run sweep -- audit` remains
the check that proves nothing was *removed*, and it stays on a schedule.

### 3. Partitioning: planned, not yet built

`audit_event` should become a **range-partitioned table on `occurredAt`**,
monthly, before it reaches roughly 10⁷ rows.

Partitioning is right for this table specifically because:

- Nothing is ever deleted, so it only grows. There is no cleanup that would
  otherwise contain it.
- Access is overwhelmingly recent: the screen pages the newest events, and the
  incremental verification reads forward from a checkpoint near the head. Both
  touch one or two partitions.
- The full sweep walks everything, but sequentially and in `seq` order, which
  partitioning does not harm.
- Old partitions can be moved to cheaper storage without any deletion, which is
  exactly what a 5-year retention obligation with no delete needs.

**Why not now:** at 7.1 MB the table is nowhere near needing it, partitioning
adds a constraint on the primary key (the partition key must be part of it), and
doing it prematurely would complicate the `seq` ordering the hash chain depends
on. It is cheaper to do once the access patterns are observed in service than to
guess now.

**The trigger to act:** the full sweep exceeding five minutes, or the table
exceeding 50 GB — whichever comes first. Both are observable from the sweep's
own output, which already prints the event count and duration.

### 4. What is deliberately *not* changed

**The global audit advisory lock** (`AUDIT_LOCK_KEY = 8410077`,
`src/lib/audit/index.ts:128`) serialises every audit append across the whole
system. It remains a real throughput ceiling — total write throughput is bounded
by one serialised append — and it is **unmeasured** under concurrency. It is not
touched here because changing how the chain is written is a change to the audit
algorithm itself, which requires explicit sign-off.

One thing narrows the concern: the public `/verify` lookup writes no audit
event, so a public flood cannot serialise an officer's write behind it. That was
verified by reading the route, not by load testing.

Measuring the ceiling belongs in Phase 4, against the local stack, with a load
tool. Until then it is a reasoned risk and is labelled as one.

## Options rejected

**A separate `audit_checkpoint` table.** Cleaner to query, but it would sit
outside the very chain whose integrity it asserts, and would need its own
tamper-evidence. Putting the checkpoint in the trail costs one migration less
and one trust assumption less.

**Replacing the full sweep with the incremental one.** This is the tempting
mistake, and the reason the limitation has a test of its own rather than only a
comment.

**Partitioning now.** Optimising a 7 MB table, at the cost of complicating the
primary key that the hash chain's ordering depends on.

## Evidence

- Measurements above, from the development database.
- `tests/integration/audit-checkpoint.test.ts` — 6 tests: full walk when there
  is no checkpoint, window when there is, the checkpoint recorded in the chain,
  tampering after the checkpoint detected, fallback to a full walk when the
  checkpoint is contradicted, and the documented limitation.
- `npm run sweep -- audit-since` and `npm run sweep -- audit`, both observed.
