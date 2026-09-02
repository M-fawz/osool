import type { Tx } from '@/lib/db'

/**
 * The three numbers a file carries, and why they are not one number.
 *
 * REQ-REG-050 step 1 assigns a **temporary number** the moment the papers are
 * entered in the incoming register — before anyone has read them, and whether
 * or not the application is ever granted. Step 5 issues a **permanent
 * registration number** only if it is. Step 6 writes a **delivery serial** in
 * the delivery ledger, which is a separate book: it records the order cards
 * left the counter, not the order they were granted, and the two diverge as
 * soon as one card waits a week to be collected.
 *
 * Collapsing any of them would mean either that a refused application had
 * consumed a registration number, or that a file spent its first week with
 * nothing to call it by at the counter.
 *
 * All three are year-scoped and printed with the year first — `2026/1183` —
 * which is how they are read out over a telephone and how they are filed on
 * paper.
 *
 * ── How they are allocated, and what changed ──────────────────────────────
 *
 * They used to be allocated by reading `MAX(SUBSTRING(column FROM n))` off the
 * table being numbered, under an advisory lock held for the rest of the
 * caller's transaction. That was wrong in two ways, and both only show up
 * later:
 *
 *   1. The maximum of a *text* column is a text comparison. `'10000'` sorts
 *      before `'9999'`, so the ten-thousandth registration of a year would have
 *      been handed `2026/10000`… and the ten-thousand-and-first would have read
 *      the same maximum and been handed it again. The unique index would then
 *      refuse the write, and card issuance would fail for every applicant for
 *      the rest of the year. Four digits is a plausible annual volume for a
 *      national register, so this was a real ceiling and not a theoretical one.
 *
 *   2. Correctness depended on every caller remembering to be inside a
 *      transaction, because the lock is a transaction lock. Nothing enforced
 *      that. A read-then-write with the lock accidentally omitted looks
 *      identical in the diff and is a race.
 *
 * Both are gone. A single `UPDATE … RETURNING` on one counter row in
 * `number_series` is atomic by itself: concurrent allocators serialise on that
 * row, the value returned is an integer, and it counts past 9,999 without
 * comment. The advisory locks are no longer needed and no longer taken —
 * removing contention that intake and issuance previously had with each other.
 */

/** Zero-padding, not a ceiling. 10,000 renders as `10000` and stays correct. */
const SEQUENCE_WIDTH = 4

type Series = 'TEMPORARY' | 'REGISTRATION' | 'DELIVERY'

function format(year: number, sequence: number, prefix = ''): string {
  return `${prefix}${year}/${String(sequence).padStart(SEQUENCE_WIDTH, '0')}`
}

/**
 * Take the next value in a year's series.
 *
 * The insert-or-increment is one statement. Postgres resolves the conflict
 * against the `(series, year)` unique index and, in the DO UPDATE branch, the
 * second writer blocks on the row the first is holding rather than reading a
 * stale value — which is exactly the property the old advisory lock was there
 * to buy, obtained here from the row itself.
 *
 * `EXCLUDED` is not used for the value on purpose: the new value is always
 * derived from what is already stored, so a concurrent allocator can never
 * overwrite a higher count with a lower one.
 */
async function nextInSeries(tx: Tx, series: Series, year: number): Promise<number> {
  const rows = await tx.$queryRaw<Array<{ lastValue: number }>>`
    INSERT INTO "number_series" ("id", "series", "year", "lastValue", "createdAt", "updatedAt")
    VALUES (${`${series.toLowerCase()}-${year}`}, ${series}, ${year}, 1, NOW(), NOW())
    ON CONFLICT ("series", "year")
      DO UPDATE SET "lastValue" = "number_series"."lastValue" + 1, "updatedAt" = NOW()
    RETURNING "lastValue"
  `

  const value = rows[0]?.lastValue
  if (value === undefined) {
    // Unreachable: RETURNING on an upsert always yields the row. Stated anyway,
    // because silently producing `NaN/0000` would be worse than failing.
    throw new Error(`Could not allocate a number in the ${series} series for ${year}.`)
  }

  return value
}

/** `T-2026/0042` — the incoming-register number, REQ-REG-050 step 1. */
export async function allocateTemporaryNumber(tx: Tx, now = new Date()): Promise<string> {
  const year = now.getUTCFullYear()
  return format(year, await nextInSeries(tx, 'TEMPORARY', year), 'T-')
}

/** `2026/1183` — the permanent registration number, REQ-REG-050 step 5. */
export async function allocateRegistrationNumber(tx: Tx, now = new Date()): Promise<string> {
  const year = now.getUTCFullYear()
  return format(year, await nextInSeries(tx, 'REGISTRATION', year))
}

/** `D-2026/0042` — the serial in the delivery ledger, REQ-REG-050 step 6. */
export async function allocateDeliverySerial(tx: Tx, now = new Date()): Promise<string> {
  const year = now.getUTCFullYear()
  return format(year, await nextInSeries(tx, 'DELIVERY', year), 'D-')
}
