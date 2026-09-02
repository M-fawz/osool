import { describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import { loadBrokerApplications } from '@/lib/applications/queues'
import { DEFAULT_PAGE_SIZE, pageInfo, readPage } from '@/lib/pagination'
import { makeBrokerEntity } from '../support/fixtures'

/**
 * Pagination, from the caller's side.
 *
 * `loadBrokerApplications` was given a `page` parameter and a sensible default,
 * and the screen that calls it passed nothing. It compiled, it ran, and it
 * quietly served the newest fifty rows with no control to reach the fifty-first
 * — worse than the unpaged version, because a broker with more history than
 * that had no indication the rest of it existed.
 *
 * So these tests assert the property the screen actually depends on: that a row
 * past the first page is *reachable*, not merely that a `take` exists. The
 * fixture deliberately holds more than one page.
 *
 * What this does not cover is the wiring in the page component itself — that a
 * `?page=` in the URL reaches this function and that the control renders. That
 * is a browser assertion and is made in the Phase 3 QA pass, not here. Stated
 * so nobody reads this file as proving more than it does.
 */

/** One more than a page, so "page two" is a real place and not an empty list. */
const ROWS = DEFAULT_PAGE_SIZE + 12

async function brokerWithHistory(): Promise<string> {
  const entity = await makeBrokerEntity()

  // Bare application rows, not the full fixture: this test is about slicing a
  // list, and building sixty applicant parties to prove it would make the suite
  // slower without making the assertion stronger.
  await db.application.createMany({
    data: Array.from({ length: ROWS }, (_, i) => ({
      brokerEntityId: entity.id,
      kind: 'NEW_REGISTRATION' as const,
      status: 'DRAFT' as const,
      applicantCapacity: 'SOLE_TRADER' as const,
      requestedCategory: 'C',
      requestedTypes: ['SELL'],
      paidUpCapital: 90_000,
      // Distinct, ordered timestamps so `orderBy: updatedAt desc` is stable and
      // the page boundaries are deterministic rather than tie-broken at random.
      updatedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
    })),
  })

  return entity.id
}

describe('a broker with more applications than fit on one page', () => {
  it('reports the true total, not the size of the page it returned', async () => {
    const entityId = await brokerWithHistory()

    const { rows, total } = await loadBrokerApplications(entityId, readPage({}))

    expect(rows).toHaveLength(DEFAULT_PAGE_SIZE)
    expect(total).toBe(ROWS)
  })

  it('can reach the row past the first page', async () => {
    const entityId = await brokerWithHistory()

    const first = await loadBrokerApplications(entityId, readPage({}))
    const second = await loadBrokerApplications(entityId, readPage({ page: '2' }))

    expect(second.rows.length).toBe(ROWS - DEFAULT_PAGE_SIZE)

    // The second page must be *different* rows, not the same slice again — a
    // `skip` that is silently dropped returns page one twice and every naive
    // length assertion still passes.
    const firstIds = new Set(first.rows.map((r) => r.id))
    const overlap = second.rows.filter((r) => firstIds.has(r.id))
    expect(overlap).toEqual([])
  })

  it('describes the window truthfully for the control that renders it', async () => {
    const entityId = await brokerWithHistory()

    const request = readPage({ page: '2' })
    const { rows, total } = await loadBrokerApplications(entityId, request)
    const info = pageInfo(request, total, rows.length)

    expect(info.total).toBe(ROWS)
    expect(info.firstRow).toBe(DEFAULT_PAGE_SIZE + 1)
    expect(info.lastRow).toBe(ROWS)
    expect(info.hasNext).toBe(false)
    expect(info.hasPrevious).toBe(true)
  })

  it('does not lose rows between the pages', async () => {
    const entityId = await brokerWithHistory()

    const seen = new Set<string>()
    for (const page of ['1', '2']) {
      const { rows } = await loadBrokerApplications(entityId, readPage({ page }))
      for (const row of rows) seen.add(row.id)
    }

    // Every row the broker owns is reachable by walking the pages. This is the
    // assertion the screen's defect actually violated.
    expect(seen.size).toBe(ROWS)
  })
})
