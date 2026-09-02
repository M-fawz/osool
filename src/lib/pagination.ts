/**
 * Pagination, as one shared answer.
 *
 * Every list in the register used to take the first hundred rows and stop —
 * `take: 100`, no total, no controls, no way to reach row 101. On a
 * demonstration database that is invisible; on a national register it means the
 * audit trail silently ends, the queue silently ends, and an officer looking
 * for a file that is not in the first hundred concludes it does not exist.
 *
 * The shape here is deliberately page-number based rather than cursor based.
 * Cursors are better for infinite scrolling and worse for this: an officer says
 * "it was on the third page", an auditor cites a page in a report, and a
 * page-numbered URL is one somebody can write down. The register's lists are
 * bounded and ordered; there is no feed here.
 */

/** How many rows a screen shows, and the sizes a user may choose. */
export const DEFAULT_PAGE_SIZE = 50
export const PAGE_SIZES = [25, 50, 100, 200] as const

export interface PageRequest {
  page: number
  pageSize: number
  /** For Prisma: `skip`. */
  skip: number
  /** For Prisma: `take`. */
  take: number
}

/**
 * Read page and size out of a URL's search params.
 *
 * Everything is clamped rather than rejected. A hand-edited `?page=-4` or
 * `?pageSize=100000` is far more likely to be a typo or a curious user than an
 * attack, and the useful response to both is the first page at a sane size —
 * not an error screen, and certainly not a query that asks PostgreSQL for a
 * hundred thousand rows.
 */
export function readPage(
  params: Record<string, string | string[] | undefined> | URLSearchParams,
  options: { defaultSize?: number } = {},
): PageRequest {
  const get = (key: string): string | undefined => {
    if (params instanceof URLSearchParams) return params.get(key) ?? undefined
    const value = params[key]
    return Array.isArray(value) ? value[0] : value
  }

  const requestedSize = Number(get('pageSize'))
  const pageSize = (PAGE_SIZES as readonly number[]).includes(requestedSize)
    ? requestedSize
    : (options.defaultSize ?? DEFAULT_PAGE_SIZE)

  const requestedPage = Number(get('page'))
  const page = Number.isFinite(requestedPage) && requestedPage >= 1 ? Math.floor(requestedPage) : 1

  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize }
}

export interface PageInfo {
  page: number
  pageSize: number
  total: number
  totalPages: number
  /** 1-based index of the first row on this page, or 0 when the page is empty. */
  firstRow: number
  lastRow: number
  hasPrevious: boolean
  hasNext: boolean
}

export function pageInfo(request: PageRequest, total: number, rowsOnPage: number): PageInfo {
  const totalPages = Math.max(1, Math.ceil(total / request.pageSize))
  const firstRow = rowsOnPage === 0 ? 0 : request.skip + 1

  return {
    page: request.page,
    pageSize: request.pageSize,
    total,
    totalPages,
    firstRow,
    lastRow: request.skip + rowsOnPage,
    hasPrevious: request.page > 1,
    hasNext: request.skip + rowsOnPage < total,
  }
}

/**
 * A URL for another page of the same list.
 *
 * Keeps every other parameter, because the filters a user has set are the
 * expensive part of what they have done and losing them on a page change is the
 * single most irritating thing a paginated table can do. `page=1` is omitted,
 * so the first page's address is the clean one people bookmark and share.
 */
export function pageHref(
  basePath: string,
  current: Record<string, string | string[] | undefined>,
  changes: { page?: number; pageSize?: number },
): string {
  const next = new URLSearchParams()

  for (const [key, value] of Object.entries(current)) {
    if (value === undefined || key === 'page' || key === 'pageSize' || key === 'locale') continue
    next.set(key, Array.isArray(value) ? (value[0] ?? '') : value)
  }

  const page = changes.page ?? Number(current.page ?? 1)
  const pageSize = changes.pageSize ?? Number(current.pageSize ?? DEFAULT_PAGE_SIZE)

  // Changing the page size while on page 9 of 40 lands somewhere arbitrary, so
  // it returns to the first page — which is what every user expects it to do.
  const effectivePage = changes.pageSize !== undefined ? 1 : page

  if (effectivePage > 1) next.set('page', String(effectivePage))
  if (pageSize !== DEFAULT_PAGE_SIZE) next.set('pageSize', String(pageSize))

  const query = next.toString()
  return query ? `${basePath}?${query}` : basePath
}

/**
 * Which page numbers to draw.
 *
 * First, last, and a window around the current page, with gaps marked. A
 * register with 900 pages must not render 900 links, and a user who is on page
 * 450 still needs to be able to reach page 1 in one click.
 */
export function pageNumbers(info: PageInfo, window = 2): Array<number | 'gap'> {
  const pages = new Set<number>([1, info.totalPages])
  for (let p = info.page - window; p <= info.page + window; p += 1) {
    if (p >= 1 && p <= info.totalPages) pages.add(p)
  }

  const sorted = [...pages].sort((a, b) => a - b)
  const out: Array<number | 'gap'> = []

  for (const [index, value] of sorted.entries()) {
    const previous = sorted[index - 1]
    if (previous !== undefined && value - previous > 1) out.push('gap')
    out.push(value)
  }

  return out
}
