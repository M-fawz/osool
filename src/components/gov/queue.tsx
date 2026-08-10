import { getTranslations } from 'next-intl/server'
import type { Role } from '@prisma/client'
import { Link } from '@/i18n/navigation'
import type { Locale } from '@/i18n/routing'
import { loadQueueForRole, type QueueRow } from '@/lib/applications/queues'
import { statusLabels } from '@/lib/applications/refusals'
import { ruleSet } from '@/lib/rules'
import {
  EmptyState,
  Panel,
  Table,
  TableCount,
  TableEmptyRow,
  Td,
  Th,
} from '@/components/ui/primitives'
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
 */
export async function RoleQueue({
  role,
  actorUserId,
  locale,
  hrefFor,
}: {
  role: Role
  actorUserId: string
  locale: Locale
  /** Where a row goes for this role. */
  hrefFor: (row: QueueRow) => string
}) {
  const t = await getTranslations('gov')
  const { rows, total } = await loadQueueForRole(role, actorUserId)

  const asOf = new Date()
  const categories = await ruleSet<{ labelAr: string; labelEn: string }>('BROKER_CATEGORY', { asOf })

  if (rows.length === 0) {
    return (
      <Panel flush>
        <EmptyState
          icon={ClipboardList}
          title={t('queueEmptyTitle')}
          description={t('queueEmptyLead')}
        />
      </Panel>
    )
  }

  return (
    <Panel flush>
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

      <div className="border-t border-rule px-4 py-2.5">
        <TableCount
          shown={rows.length}
          total={total}
          label={t('queueCount', { shown: rows.length, total })}
        />
      </div>
    </Panel>
  )
}
