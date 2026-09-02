import { describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import {
  allocateDeliverySerial,
  allocateRegistrationNumber,
  allocateTemporaryNumber,
} from '@/lib/applications/numbering'

/**
 * Phase 9 — reference numbers under concurrency.
 *
 * The two properties that matter are that no number is ever handed out twice,
 * and that the series keeps counting past 9,999. Both were broken by the
 * previous `MAX(SUBSTRING(...))` implementation, and neither is provable by
 * reading the code: the first needs genuinely parallel callers, and the second
 * needs the counter driven past the boundary.
 */

/** A far-future year, so these tests never touch the live 2026 counters. */
function isolatedYear(): Date {
  const year = 3000 + Math.floor(Math.random() * 900)
  return new Date(Date.UTC(year, 5, 1))
}

describe('allocation under concurrency', () => {
  it('hands out 50 unique registration numbers to 50 simultaneous callers', async () => {
    const now = isolatedYear()

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
    const now = isolatedYear()

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
    const now = isolatedYear()
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
    const base = isolatedYear().getUTCFullYear()

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
