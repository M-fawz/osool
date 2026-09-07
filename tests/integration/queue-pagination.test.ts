import { beforeAll, describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import { loadQueueForRole } from '@/lib/applications/queues'
import { DEFAULT_PAGE_SIZE, pageInfo, readPage } from '@/lib/pagination'
import { makeBrokerEntity, ns } from '../support/fixtures'

/**
 * The officer queues, at national scale.
 *
 * `tests/integration/pagination.test.ts` covers the same property for the
 * broker's own list at sixty-two rows. This file is the officer's side, and it
 * uses a deliberately large fixture because the failure it guards against only
 * appears at size: the queue screen asked the loader for a page and never said
 * which one, so it always received the first fifty rows and rendered no
 * controls. On a demonstration database with forty applications that is
 * invisible. On the seeded database it hid 764 of 814 files, and the footer
 * cheerfully printed "Showing 50 of 814" with no way to act on the number.
 *
 * The oldest-first sort is what makes it more than an inconvenience. The rows
 * beyond the first page are the *newest* ones, so a file submitted this morning
 * was unreachable from the clerk's screen until the backlog in front of it
 * cleared — the opposite of what an officer would assume a queue does.
 *
 * Five thousand rows, because the brief that found the defect asked for the
 * 101st and the 4,999th to be reachable, and because a page-number scheme that
 * works at sixty-two rows can still be wrong about `skip` arithmetic at four
 * figures. It is affordable now: each run gets its own PostgreSQL schema
 * (ADR 0002), so a large fixture no longer poisons the runs after it.
 *
 * ── Why every assertion carries a search term ────────────────────────────
 *
 * Integration files share one schema for the run, and half a dozen of them
 * create SUBMITTED applications of their own. An unscoped `total` would
 * therefore be "5,000 plus whatever ran before me", which is not something to
 * assert on. Every row here is tagged with a per-run prefix and the queries
 * search for it, so the set under test is exactly the fixture — and the search
 * parameter, which no screen ever passed until now, gets exercised on the way
 * past.
 */

const ROWS = 5_000
const PAGES = ROWS / DEFAULT_PAGE_SIZE

/** Unique per run, so `temporaryNumber` stays unique and the scope is exact. */
const TAG = `QP${ns()}`

/** The reference this fixture gives to the nth row, 1-based. */
const refFor = (row: number) => `${TAG}-${String(row).padStart(5, '0')}`

/** The clerk's queue is the one with the backlog: SUBMITTED and UNDER_INTAKE. */
const CLERK = 'REGISTRY_CLERK' as const
const ACTOR = 'queue-pagination-test-actor'

/** The fixture, scoped to this run's tag. */
function queue(options: { page?: number; pageSize?: number } = {}) {
  const request = readPage({
    page: options.page === undefined ? undefined : String(options.page),
    pageSize: options.pageSize === undefined ? undefined : String(options.pageSize),
  })
  return loadQueueForRole(CLERK, ACTOR, { page: request, search: TAG }).then((result) => ({
    ...result,
    request,
  }))
}

beforeAll(async () => {
  const entity = await makeBrokerEntity()
  const base = Date.UTC(2026, 0, 1)

  // In chunks: a single 5,000-row `createMany` builds one very large statement,
  // and the point here is the pagination, not how much a driver will swallow.
  const CHUNK = 500
  for (let start = 0; start < ROWS; start += CHUNK) {
    await db.application.createMany({
      data: Array.from({ length: Math.min(CHUNK, ROWS - start) }, (_, i) => {
        const row = start + i + 1
        return {
          brokerEntityId: entity.id,
          kind: 'NEW_REGISTRATION' as const,
          status: 'SUBMITTED' as const,
          applicantCapacity: 'SOLE_TRADER' as const,
          requestedCategory: 'C',
          requestedTypes: ['SELL'],
          paidUpCapital: 90_000,
          // The row's ordinal is carried in the reference, so an assertion can
          // name the row it expects rather than counting to it.
          temporaryNumber: refFor(row),
          submittedAt: new Date(base + row * 60_000),
          // Distinct and ordered, so `orderBy: updatedAt asc` is stable and the
          // page boundaries are deterministic rather than tie-broken at random.
          updatedAt: new Date(base + row * 60_000),
        }
      }),
    })
  }
}, 120_000)

describe('a queue larger than one page', () => {
  it('reports the true total, not the size of the page it returned', async () => {
    const { rows, total } = await queue()

    expect(rows).toHaveLength(DEFAULT_PAGE_SIZE)
    expect(total).toBe(ROWS)
  })

  /**
   * The rows the brief named, each fetched through the page a user would
   * actually be on. `?page=` is 1-based and `skip` is 0-based, which is the
   * arithmetic that goes wrong silently — an off-by-one here repeats or skips a
   * row at every page boundary and nothing else in the system notices.
   */
  it.each([
    { row: 1, page: 1 },
    { row: 50, page: 1 },
    { row: 51, page: 2 },
    { row: 101, page: 3 },
    { row: 500, page: 10 },
    { row: 4_999, page: 100 },
    { row: 5_000, page: 100 },
  ])('reaches row $row, on page $page', async ({ row, page }) => {
    const { rows, request } = await queue({ page })

    expect(rows[row - 1 - request.skip]?.temporaryNumber).toBe(refFor(row))
  })

  it('describes the last page truthfully rather than offering a next one', async () => {
    const { rows, total, request } = await queue({ page: PAGES })
    const info = pageInfo(request, total, rows.length)

    expect(info.totalPages).toBe(PAGES)
    expect(info.firstRow).toBe(ROWS - DEFAULT_PAGE_SIZE + 1)
    expect(info.lastRow).toBe(ROWS)
    expect(info.hasNext).toBe(false)
    expect(info.hasPrevious).toBe(true)
  })

  it('loses no row and repeats none across every page', async () => {
    const seen = new Set<string>()

    for (let page = 1; page <= PAGES; page += 1) {
      const { rows } = await queue({ page })
      for (const row of rows) seen.add(row.temporaryNumber!)
    }

    expect(seen.size).toBe(ROWS)
  })

  /**
   * A page past the end returns nothing rather than failing, and says so
   * honestly. Somebody edits the URL, or holds a bookmark to page 40 of a queue
   * that has since been worked down; neither deserves an error screen.
   */
  it('returns an empty page past the end, with the total still true', async () => {
    const { rows, total, request } = await queue({ page: PAGES * 4 })

    expect(rows).toHaveLength(0)
    expect(total).toBe(ROWS)
    expect(pageInfo(request, total, rows.length).firstRow).toBe(0)
  })

  /** A larger page size is honoured, and is what makes 5,000 rows workable. */
  it('honours a chosen page size', async () => {
    const { rows } = await queue({ pageSize: 200, page: 2 })

    expect(rows).toHaveLength(200)
    expect(rows[0]?.temporaryNumber).toBe(refFor(201))
  })

  /** `?page=-4` is a typo, not an attack. It lands on page one. */
  it('clamps a nonsensical page rather than refusing it', async () => {
    const request = readPage({ page: '-4' })

    expect(request.page).toBe(1)
    expect(request.skip).toBe(0)
  })
})

describe('searching a queue', () => {
  /**
   * The search term has been a parameter of `loadQueue` since it was written
   * and no screen ever passed one, so an officer holding a firm's name in front
   * of them had to page to find it. With the control now rendered, the filter
   * has to narrow the *total* as well as the rows — a search that returns three
   * rows while the footer still claims five thousand is a worse lie than no
   * search at all.
   */
  it('narrows the total, not only the page', async () => {
    const { rows, total } = await loadQueueForRole(CLERK, ACTOR, {
      page: readPage({}),
      search: refFor(123),
    })

    expect(total).toBe(1)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.temporaryNumber).toBe(refFor(123))
  })

  it('finds nothing for a term that matches nothing, without failing', async () => {
    const { rows, total } = await loadQueueForRole(CLERK, ACTOR, {
      page: readPage({}),
      search: 'no-such-firm-anywhere',
    })

    expect(total).toBe(0)
    expect(rows).toHaveLength(0)
  })
})
