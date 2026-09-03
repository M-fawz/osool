import { describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import { RuleSetNotFoundError, ruleSet, ruleSetVersionsInForce } from '@/lib/rules'
import { ns } from '../support/fixtures'

/**
 * The version stamp on every decision — and the query behind it.
 *
 * `ruleSetVersionsInForce` used to call `ruleSet()` once per code, and
 * `ruleSet()` loads every item in a set because most callers want them.
 * Stamping one transition therefore ran four queries and materialised 38 rule
 * items to read four integers: 22.1 ms measured, on every transition.
 *
 * It is now one query selecting two columns — 2.3 ms measured. The risk in that
 * change is entirely about *equivalence*: the batched query must choose exactly
 * the same version `ruleSet()` would have, including where effective windows
 * overlap. That is what these tests pin down.
 */

const STAMPED = ['BROKER_CATEGORY', 'DOC_CHECKLIST', 'DECLARATIONS', 'OBLIGATION_PERIODS']

/** What the previous implementation did, kept here as the reference answer. */
async function oneAtATime(codes: string[], asOf: Date): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  for (const code of codes) {
    try {
      out[code] = (await ruleSet(code, { asOf })).version
    } catch (error) {
      if (!(error instanceof RuleSetNotFoundError)) throw error
    }
  }
  return out
}

describe('the batched version lookup', () => {
  it('agrees with resolving each set on its own', async () => {
    const asOf = new Date()
    expect(await ruleSetVersionsInForce(STAMPED, { asOf })).toEqual(
      await oneAtATime(STAMPED, asOf),
    )
  })

  it('stamps every rule set the seed publishes', async () => {
    const asOf = new Date()
    const versions = await ruleSetVersionsInForce(STAMPED, { asOf })

    for (const code of STAMPED) {
      expect(versions[code], `${code} should be stamped`).toBeGreaterThan(0)
    }
  })

  it('leaves out a code that has no version in force', async () => {
    const versions = await ruleSetVersionsInForce(['NO_SUCH_RULE_SET'], { asOf: new Date() })

    // Omitted, not zero and not undefined-valued: the stamp lists the rule sets
    // that judged a decision, and one that judged nothing does not belong in it.
    expect(Object.keys(versions)).toEqual([])
  })

  it('leaves out a code whose window has not opened yet', async () => {
    const asOf = new Date('2019-01-01T00:00:00Z')
    const versions = await ruleSetVersionsInForce(['RETENTION'], { asOf })

    // RETENTION is effective from 2020-02-01.
    expect(versions.RETENTION).toBeUndefined()
    expect(await oneAtATime(['RETENTION'], asOf)).toEqual(versions)
  })

  it('picks the most recently effective version where windows overlap', async () => {
    /*
     * Overlapping windows should not happen — `findOverlappingRuleSets()`
     * reports them — but a mis-entered effective date can cause it, and the two
     * implementations must resolve it identically or a decision could be
     * stamped with one version and judged under another.
     */
    const code = `TEST_OVERLAP_${ns()}`

    await db.ruleSet.create({
      data: {
        code,
        version: 1,
        effectiveFrom: new Date('2026-01-01T00:00:00Z'),
        requirementIds: [],
        items: { create: [{ key: 'A', position: 1, payload: { v: 1 } }] },
      },
    })
    await db.ruleSet.create({
      data: {
        code,
        version: 2,
        effectiveFrom: new Date('2026-06-01T00:00:00Z'),
        requirementIds: [],
        items: { create: [{ key: 'A', position: 1, payload: { v: 2 } }] },
      },
    })

    const asOf = new Date('2026-09-01T00:00:00Z')

    // Version 2 is the later-effective one, so both must choose it.
    expect(await ruleSetVersionsInForce([code], { asOf })).toEqual({ [code]: 2 })
    expect(await ruleSetVersionsInForce([code], { asOf })).toEqual(await oneAtATime([code], asOf))

    // …and before the second window opens, both must choose version 1.
    const earlier = new Date('2026-03-01T00:00:00Z')
    expect(await ruleSetVersionsInForce([code], { asOf: earlier })).toEqual({ [code]: 1 })
    expect(await ruleSetVersionsInForce([code], { asOf: earlier })).toEqual(
      await oneAtATime([code], earlier),
    )
  })

  it('honours an archived version by ignoring it', async () => {
    const code = `TEST_ARCHIVED_${ns()}`

    await db.ruleSet.create({
      data: {
        code,
        version: 1,
        effectiveFrom: new Date('2026-01-01T00:00:00Z'),
        archivedAt: new Date('2026-02-01T00:00:00Z'),
        requirementIds: [],
      },
    })

    const asOf = new Date('2026-09-01T00:00:00Z')
    expect(await ruleSetVersionsInForce([code], { asOf })).toEqual({})
    expect(await oneAtATime([code], asOf)).toEqual({})
  })
})
