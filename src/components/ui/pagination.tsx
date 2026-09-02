import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/cn'
import { pageHref, pageNumbers, PAGE_SIZES, type PageInfo } from '@/lib/pagination'
import { Icon, ChevronLeft, ChevronRight } from './icon'

/**
 * Paging controls for a register list.
 *
 * Server-rendered links, not buttons with an onClick. Three things follow from
 * that and all three matter here: the page works with JavaScript unavailable,
 * every page has an address an official can write in a report or send to a
 * colleague, and the browser's back button does what it looks like it does.
 *
 * The row count is stated in words above the controls — "Showing 51–100 of
 * 1,284" — because the single most useful thing a paginated table can tell
 * somebody is how much they have *not* seen. The previous screens showed a
 * hundred rows and said nothing, so a queue of six hundred looked like a queue
 * of one hundred.
 *
 * Direction: the chevrons resolve from the locale, so "next" points left in
 * Arabic. A hard-coded right chevron would mean "previous" on the Arabic
 * screens, which is exactly the error 03-DESIGN-DIRECTION §5 warns about.
 */

const linkBase =
  'inline-flex h-9 min-w-9 items-center justify-center rounded-xs border px-2.5 text-sm ' +
  'transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-600'

export function Pagination({
  info,
  basePath,
  searchParams,
  locale,
  labels,
  className,
}: {
  info: PageInfo
  /** Locale-less path — `/audit`, `/register`. `Link` adds the locale. */
  basePath: string
  /** The current query, so filters survive a page change. */
  searchParams: Record<string, string | string[] | undefined>
  locale: string
  labels: {
    showing: string
    previous: string
    next: string
    page: string
    perPage: string
    /** "Nothing to show" — rendered instead of controls on an empty list. */
    empty: string
  }
  className?: string
}) {
  const Backward = locale === 'ar' ? ChevronRight : ChevronLeft
  const Forward = locale === 'ar' ? ChevronLeft : ChevronRight

  if (info.total === 0) {
    return (
      <div className={cn('flex items-center justify-between gap-4 px-4 py-3', className)}>
        <p className="text-xs text-ink-muted">{labels.empty}</p>
      </div>
    )
  }

  return (
    <nav
      aria-label={labels.page}
      className={cn(
        'flex flex-col gap-3 border-t border-rule px-4 py-3',
        'sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      {/* The count first. On a phone it is the only line that fits, and it is
          the line that carries the information. */}
      <p className="text-xs tabular-nums text-ink-muted">{labels.showing}</p>

      <div className="flex flex-wrap items-center gap-3">
        {/* Page size. Rendered as links so it needs no client component. */}
        <div className="flex items-center gap-1.5">
          <span className="text-2xs uppercase tracking-wider text-ink-faint">{labels.perPage}</span>
          <div className="flex items-center gap-0.5">
            {PAGE_SIZES.map((size) => {
              const active = size === info.pageSize
              return (
                <Link
                  key={size}
                  href={pageHref(basePath, searchParams, { pageSize: size })}
                  aria-current={active ? 'true' : undefined}
                  className={cn(
                    'inline-flex h-7 min-w-7 items-center justify-center rounded-xs px-1.5 text-2xs tabular-nums',
                    active
                      ? 'bg-navy-700 font-semibold text-paper'
                      : 'text-ink-muted hover:bg-navy-50 hover:text-navy-700',
                  )}
                >
                  {size}
                </Link>
              )
            })}
          </div>
        </div>

        {info.totalPages > 1 ? (
          <div className="flex items-center gap-1">
            <PageLink
              href={pageHref(basePath, searchParams, { page: info.page - 1 })}
              disabled={!info.hasPrevious}
              label={labels.previous}
            >
              <Icon as={Backward} size="sm" />
            </PageLink>

            {pageNumbers(info).map((entry, index) =>
              entry === 'gap' ? (
                <span
                  key={`gap-${index}`}
                  aria-hidden
                  className="px-1 text-sm text-ink-faint"
                >
                  …
                </span>
              ) : (
                <Link
                  key={entry}
                  href={pageHref(basePath, searchParams, { page: entry })}
                  aria-current={entry === info.page ? 'page' : undefined}
                  className={cn(
                    linkBase,
                    'tabular-nums',
                    entry === info.page
                      ? 'border-navy-700 bg-navy-700 font-semibold text-paper'
                      : 'border-rule bg-paper text-ink hover:border-rule-strong hover:bg-navy-50',
                  )}
                >
                  {entry}
                </Link>
              ),
            )}

            <PageLink
              href={pageHref(basePath, searchParams, { page: info.page + 1 })}
              disabled={!info.hasNext}
              label={labels.next}
            >
              <Icon as={Forward} size="sm" />
            </PageLink>
          </div>
        ) : null}
      </div>
    </nav>
  )
}

/**
 * A step control that is a link when it goes somewhere and a disabled span
 * when it does not.
 *
 * Not a link with `aria-disabled`: a disabled anchor is still focusable and
 * still navigates on Enter in several browsers, so "previous" on page one
 * would quietly reload page one and read as a broken control to anyone using a
 * keyboard.
 */
function PageLink({
  href,
  disabled,
  label,
  children,
}: {
  href: string
  disabled: boolean
  label: string
  children: React.ReactNode
}) {
  if (disabled) {
    return (
      <span
        aria-hidden
        className={cn(linkBase, 'cursor-default border-rule bg-paper-sunk text-ink-faint opacity-60')}
      >
        {children}
      </span>
    )
  }

  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(linkBase, 'border-rule bg-paper text-ink hover:border-rule-strong hover:bg-navy-50')}
    >
      {children}
    </Link>
  )
}
