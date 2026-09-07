import { getTranslations } from 'next-intl/server'
import type { Role } from '@prisma/client'
import { Link } from '@/i18n/navigation'
import type { Locale } from '@/i18n/routing'
import { loadQueueForRole, type QueueRow } from '@/lib/applications/queues'
import { statusLabels } from '@/lib/applications/refusals'
import { pageInfo, type PageRequest } from '@/lib/pagination'
import { ruleSet } from '@/lib/rules'
import {
  EmptyState,
  Panel,
  Table,
  TableEmptyRow,
  Td,
  Th,
} from '@/components/ui/primitives'
import { Pagination } from '@/components/ui/pagination'
import { Field, Input } from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import { Status } from '@/components/ui/status'
import { Ltr, Money, Stamp, TruncatedName } from '@/components/ui/bidi'
import { ClipboardList } from '@/components/ui/icon'

/**
 * A government role's queue, as its landing screen.
 *
 * One component for all six queues, because they answer the same question —
 * "what is waiting for me, oldest first, with enough context to triage without
 * opening it" — and six near-identical tables would drift apart within a phase.
 * What differs between roles is the set of states and where a row links to, and
 * both are data.
 *
 * The waiting column is the one that earns its place. A queue sorted by age
 * without *showing* the age lets a file sit for three weeks looking exactly
 * like one that arrived this morning.
 *
 * ── Paging ───────────────────────────────────────────────────────────────
 *
 * This screen previously asked the loader for a page and never said which one,
 * so it always got the first fifty rows and drew no controls. On the seeded
 * database that is 50 of 814 files in the clerk's queue: the other 764 were
 * unreachable from the interface, and the footer said "Showing 50 of 814" with
 * no way to act on the number. A queue that silently ends is worse than a slow
 * one — an officer looking for a file that is not in the first fifty concludes
 * it is not in the system, and the oldest-first sort means the hidden rows are
 * the *newest*, so a file submitted today was invisible until the backlog
 * cleared.
 *
 * The loader, `readPage`, `pageInfo` and `Pagination` all already existed and
 * are used correctly by `/register` and `/audit`. Only the wiring was missing.
 *
 * The search box is the same story: `loadQueue` has taken a `search` term since
 * it was written and nothing ever passed one. An officer with a firm's name in
 * front of them should not have to page to find it.
 */
export async function RoleQueue({
  role,
  actorUserId,
  locale,
  hrefFor,
  page,
  search,
  basePath,
  searchParams,
}: {
  role: Role
  actorUserId: string
  locale: Locale
  /** Where a row goes for this role. */
  hrefFor: (row: QueueRow) => string
  page: PageRequest
  search: string | null
  /** Locale-less path — `/intake`, `/examination`. `Link` adds the locale. */
  basePath: string
  /** The current query, so a page change keeps the search. */
  searchParams: Record<string, string | string[] | undefined>
}) {
  const t = await getTranslations('gov')
  const { rows, total } = await loadQueueForRole(role, actorUserId, { page, search })

  const info = pageInfo(page, total, rows.length)
  const asOf = new Date()
  const categories = await ruleSet<{ labelAr: string; labelEn: string }>('BROKER_CATEGORY', { asOf })

  return (
    <>
      {/* A plain GET form, for the same reasons the register's filter bar is
          one: every search has an address, the back button walks back through
          searches, and it works with JavaScript unavailable. `page` is not
          carried through, so a new search lands on page one. */}
      <Panel className="mb-6">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <Field label={t('queueSearchLabel')} htmlFor="queue-q" hint={t('queueSearchHint')} className="min-w-64 flex-1">
            <Input
              id="queue-q"
              name="q"
              type="search"
              defaultValue={search ?? ''}
              placeholder={t('queueSearchPlaceholder')}
              autoComplete="off"
            />
          </Field>
          <Button type="submit">{t('queueSearchAction')}</Button>
          {search ? (
            <Link
              href={basePath}
              className="inline-flex min-h-9 items-center rounded-xs px-2 text-sm text-navy-600 hover:underline"
            >
              {t('queueSearchClear')}
            </Link>
          ) : null}
        </form>
      </Panel>

      <Panel flush>
        {rows.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={search ? t('queueNoMatchTitle') : t('queueEmptyTitle')}
            description={search ? t('queueNoMatchLead') : t('queueEmptyLead')}
          />
        ) : (
          <Table
            caption={t('queueTitle')}
            layout="fixed"
            minWidth="60rem"
            density="compact"
          >
            <thead>
              <tr>
                <Th className="w-32">{t('colRef')}</Th>
                <Th className="w-64">{t('colEntity')}</Th>
                <Th className="w-24">{t('colCategory')}</Th>
                <Th className="w-36" numeric>
                  {t('colCapital')}
                </Th>
                <Th className="w-40">{t('colStatus')}</Th>
                <Th className="w-28">{t('colWaiting')}</Th>
                <Th className="w-28">{t('colAction')}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <Td>
                    {row.temporaryNumber ? (
                      <Ltr className="font-mono text-xs">{row.temporaryNumber}</Ltr>
                    ) : row.registrationNumber ? (
                      <Ltr className="font-mono text-xs">{row.registrationNumber}</Ltr>
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
                  </Td>
                  <Td>
                    <TruncatedName title={row.tradeNameAr}>{row.tradeNameAr}</TruncatedName>
                    {row.tradeNameEn ? (
                      <TruncatedName className="text-2xs text-ink-faint" title={row.tradeNameEn}>
                        {row.tradeNameEn}
                      </TruncatedName>
                    ) : null}
                  </Td>
                  <Td>
                    {row.requestedCategory
                      ? (categories.byKey.get(row.requestedCategory)?.payload[
                          locale === 'ar' ? 'labelAr' : 'labelEn'
                        ] ?? row.requestedCategory)
                      : '—'}
                  </Td>
                  <Td numeric>
                    {row.paidUpCapital ? (
                      <Money amount={row.paidUpCapital} locale={locale} />
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
                  </Td>
                  <Td>
                    <Status tone="informational" size="sm">
                      {statusLabels[row.status][locale]}
                    </Status>
                    {row.openCompletions > 0 ? (
                      <span className="mt-1 block text-2xs text-caution">
                        {t('completionsOutstanding')}
                      </span>
                    ) : null}
                  </Td>
                  <Td>
                    {/* Days, not a date. "Waiting 12 days" is the triage fact; the
                        date it arrived is a lookup the officer would have to do. */}
                    <span className={row.waitingDays >= 7 ? 'font-medium text-caution' : undefined}>
                      {row.waitingDays === 0
                        ? t('waitingToday')
                        : t('waitingDays', { days: row.waitingDays })}
                    </span>
                    {row.submittedAt ? (
                      <span className="mt-0.5 block text-2xs text-ink-faint">
                        <Stamp value={row.submittedAt} />
                      </span>
                    ) : null}
                  </Td>
                  <Td>
                    <Link
                      href={hrefFor(row)}
                      className="inline-flex min-h-8 items-center rounded-xs text-sm font-medium text-navy-600 hover:underline"
                    >
                      {t('openFile')}
                    </Link>
                  </Td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <TableEmptyRow colSpan={7}>
                  <EmptyState
                    icon={ClipboardList}
                    title={t('queueEmptyTitle')}
                    description={t('queueEmptyLead')}
                    size="sm"
                  />
                </TableEmptyRow>
              ) : null}
            </tbody>
          </Table>
        )}

        <Pagination
          info={info}
          basePath={basePath}
          searchParams={searchParams}
          locale={locale}
          labels={{
            showing: t('queueShowing', {
              first: info.firstRow,
              last: info.lastRow,
              total: info.total,
            }),
            previous: t('previousPage'),
            next: t('nextPage'),
            page: t('queuePagination'),
            perPage: t('perPage'),
            empty: search ? t('queueNoMatchTitle') : t('queueEmptyTitle'),
          }}
        />
      </Panel>
    </>
  )
}
