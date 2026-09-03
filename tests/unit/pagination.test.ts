import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PAGE_SIZE,
  pageHref,
  pageInfo,
  pageNumbers,
  readPage,
} from '@/lib/pagination'

/**
 * The paging arithmetic, on its own.
 *
 * These are pure functions and they decide something a user notices
 * immediately: whether the rows they are looking for are reachable, and whether
 * the filters they set survive a page change. They deserve tests that run in
 * milliseconds and need no database.
 *
 * This file is also the first occupant of `tests/unit/`. The directory was
 * referenced by `vitest.config.ts` and by the `ci` script and did not exist, so
 * `npm run test:unit` matched zero files and reported success — CI had been
 * gating on an empty set.
 */

describe('readPage', () => {
  it('defaults to the first page at the default size', () => {
    expect(readPage({})).toEqual({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      skip: 0,
      take: DEFAULT_PAGE_SIZE,
    })
  })

  it('clamps a nonsense page rather than refusing it', () => {
    // A hand-edited URL is a typo or a curious user far more often than an
    // attack, and an error screen serves neither.
    for (const page of ['-4', '0', 'banana', '', 'NaN']) {
      expect(readPage({ page }).page).toBe(1)
    }
  })

  it('refuses a page size that is not on the offered list', () => {
    // The guard that stops `?pageSize=100000` becoming a query for a hundred
    // thousand rows.
    expect(readPage({ pageSize: '100000' }).pageSize).toBe(DEFAULT_PAGE_SIZE)
    expect(readPage({ pageSize: '37' }).pageSize).toBe(DEFAULT_PAGE_SIZE)
    expect(readPage({ pageSize: '100' }).pageSize).toBe(100)
  })

  it('computes skip from the page and size together', () => {
    expect(readPage({ page: '3', pageSize: '25' })).toMatchObject({ skip: 50, take: 25 })
  })

  it('reads the first value when a param is repeated', () => {
    expect(readPage({ page: ['2', '9'] }).page).toBe(2)
  })

  it('accepts URLSearchParams as well as a plain record', () => {
    expect(readPage(new URLSearchParams('page=4&pageSize=25')).skip).toBe(75)
  })
})

describe('pageInfo', () => {
  it('describes a full first page of a longer list', () => {
    const info = pageInfo(readPage({}), 62, DEFAULT_PAGE_SIZE)
    expect(info).toMatchObject({
      firstRow: 1,
      lastRow: 50,
      total: 62,
      totalPages: 2,
      hasPrevious: false,
      hasNext: true,
    })
  })

  it('describes the last, partial page', () => {
    const info = pageInfo(readPage({ page: '2' }), 62, 12)
    expect(info).toMatchObject({
      firstRow: 51,
      lastRow: 62,
      hasPrevious: true,
      hasNext: false,
    })
  })

  it('reports row zero for an empty list rather than row one of nothing', () => {
    const info = pageInfo(readPage({}), 0, 0)
    expect(info.firstRow).toBe(0)
    expect(info.lastRow).toBe(0)
    expect(info.totalPages).toBe(1)
    expect(info.hasNext).toBe(false)
  })

  it('never claims a next page when the window already reaches the total', () => {
    const info = pageInfo(readPage({ pageSize: '25' }), 25, 25)
    expect(info.hasNext).toBe(false)
  })
})

describe('pageHref', () => {
  it('keeps the filters a user has set', () => {
    const href = pageHref('/register', { status: 'ACTIVE', governorate: 'CAI' }, { page: 3 })
    expect(href).toContain('status=ACTIVE')
    expect(href).toContain('governorate=CAI')
    expect(href).toContain('page=3')
  })

  it('leaves page=1 out, so the first page has the clean address', () => {
    expect(pageHref('/register', {}, { page: 1 })).not.toContain('page=')
  })
})

describe('pageNumbers', () => {
  it('lists every page when there are few of them', () => {
    const info = pageInfo(readPage({}), 120, DEFAULT_PAGE_SIZE)
    expect(pageNumbers(info)).toEqual([1, 2, 3])
  })

  it('elides the middle of a long list rather than printing hundreds of links', () => {
    const info = pageInfo(readPage({ page: '50' }), 5_000, DEFAULT_PAGE_SIZE)
    const numbers = pageNumbers(info)

    expect(numbers).toContain(1)
    expect(numbers).toContain(50)
    expect(numbers).toContain(100)
    expect(numbers).toContain('gap')
    // Short enough to render as a row of controls, not a wall of them.
    expect(numbers.length).toBeLessThan(15)
  })
})
