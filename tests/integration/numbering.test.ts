import { describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import {
  allocateDeliverySerial,
  allocateRegistrationNumber,
  allocateTemporaryNumber,
} from '@/lib/applications/numbering'
import { reserveYearAsDate, reserveYears } from '../support/fixtures'

/**
 * Phase 9 — reference numbers under concurrency.
 *
 * The two properties that matter are that no number is ever handed out twice,
 * and that the series keeps counting past 9,999. Both were broken by the
 * previous `MAX(SUBSTRING(...))` implementation, and neither is provable by
 * reading the code: the first needs genuinely parallel callers, and the second
 * needs the counter driven past the boundary.
 */

/**
 * A far-future year, so these tests never touch the live 2026 counters.
 *
 * Reserved, not drawn at random. `reserveYears` in the fixtures explains why at
 * length: because nothing is ever deleted, a random year collides with an
 * earlier run's leftovers eventually, and the failure rate rises with the age of
 * the database rather than staying constant.
 */
const isolatedYear = reserveYearAsDate

describe('allocation under concurrency', () => {
  it('hands out 50 unique registration numbers to 50 simultaneous callers', async () => {
    const now = await isolatedYear()

    const numbers = await Promise.all(
      Array.from({ length: 50 }, () =>
        db.$transaction((tx) => allocateRegistrationNumber(tx, now)),
      ),
    )

    expect(new Set(numbers).size).toBe(50)

    // …and they are a contiguous run, not fifty numbers that merely differ.
    const sequences = numbers.map((n) => Number(n.split('/')[1])).sort((a, b) => a - b)
    expect(sequences[sequences.length - 1]! - sequences[0]!).toBe(49)
  })

  it('keeps the three series independent of one another', async () => {
    const now = await isolatedYear()

    const [temporary, registration, delivery] = await Promise.all([
      db.$transaction((tx) => allocateTemporaryNumber(tx, now)),
      db.$transaction((tx) => allocateRegistrationNumber(tx, now)),
      db.$transaction((tx) => allocateDeliverySerial(tx, now)),
    ])

    const year = now.getUTCFullYear()
    expect(temporary).toBe(`T-${year}/0001`)
    expect(registration).toBe(`${year}/0001`)
    expect(delivery).toBe(`D-${year}/0001`)
  })
})

describe('the four-digit boundary', () => {
  it('counts from 9,999 into five digits without repeating or truncating', async () => {
    const now = await isolatedYear()
    const year = now.getUTCFullYear()

    await db.numberSeries.create({
      data: { series: 'REGISTRATION', year, lastValue: 9_998 },
    })

    const a = await db.$transaction((tx) => allocateRegistrationNumber(tx, now))
    const b = await db.$transaction((tx) => allocateRegistrationNumber(tx, now))
    const c = await db.$transaction((tx) => allocateRegistrationNumber(tx, now))

    expect(a).toBe(`${year}/9999`)
    expect(b).toBe(`${year}/10000`)
    expect(c).toBe(`${year}/10001`)

    // The old text-MAX implementation returned 9999 for all three, because
    // '10000' < '9999' as text. This is the assertion that would have caught it.
    expect(new Set([a, b, c]).size).toBe(3)
  })
})

describe('year scoping', () => {
  it('restarts each January rather than running on from the year before', async () => {
    // Two consecutive years, both reserved: this test uses `base` and
    // `base + 1`, and reserving only the first is what made it the most
    // frequent casualty of the old helper.
    const base = await reserveYears(2)

    const first = await db.$transaction((tx) =>
      allocateRegistrationNumber(tx, new Date(Date.UTC(base, 11, 31))),
    )
    const second = await db.$transaction((tx) =>
      allocateRegistrationNumber(tx, new Date(Date.UTC(base + 1, 0, 1))),
    )

    expect(first).toBe(`${base}/0001`)
    expect(second).toBe(`${base + 1}/0001`)
  })
})

/**
 * The regression guard for the flake itself.
 *
 * The old helper drew a year at random from a fixed range and asserted nothing
 * about it. These are the invariants it did not have, and could not have: they
 * are what makes the isolation a property of the design rather than of how many
 * times the suite has been run before.
 */
describe('year reservation', () => {
  it('never returns a year that any earlier run has already counted in', async () => {
    const base = await reserveYears(1)

    // Every year the reservation handed back must be untouched by the
    // allocators — no `lastValue` above zero anywhere in the block.
    const used = await db.numberSeries.findMany({
      where: { year: base, lastValue: { gt: 0 } },
    })
    expect(used).toEqual([])

    // …and the first number it hands out is genuinely the first.
    const first = await db.$transaction((tx) =>
      allocateRegistrationNumber(tx, new Date(Date.UTC(base, 5, 1))),
    )
    expect(first).toBe(`${base}/0001`)
  })

  it('hands out disjoint blocks to successive callers', async () => {
    const a = await reserveYears(2)
    const b = await reserveYears(2)

    // b must start after a's whole block, not merely differ from its first year
    // — overlapping by one is exactly how the year-scoping test used to break.
    expect(b).toBeGreaterThan(a + 1)
  })

  it('is monotonic, so the guarantee survives any number of runs', async () => {
    const first = await reserveYears(1)
    const second = await reserveYears(1)
    expect(second).toBeGreaterThan(first)
  })
})
