import type { BrokerCategory, BrokerType, Governorate, RegistrationStatus } from '@prisma/client'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { guard } from '@/lib/auth/guard'
import { AccessRefused } from '@/components/layout/access-refused'
import { Shell } from '@/components/layout/shell'
import { Link } from '@/i18n/navigation'
import type { Locale } from '@/i18n/routing'
import { roleLabel } from '@/lib/auth/roles'
import { governorateLabels } from '@/lib/reference/governorates'
import { pageInfo, readPage } from '@/lib/pagination'
import {
  recordRegisterSearch,
  registerSummary,
  searchRegister,
  type RegisterFilters,
} from '@/lib/registry/search'
import {
  EmptyState,
  PageHeader,
  Panel,
  Status,
  Table,
  TableEmptyRow,
  Td,
  Th,
} from '@/components/ui/primitives'
import { Pagination } from '@/components/ui/pagination'
import { FileSearch } from '@/components/ui/icon'
import { Ltr, Stamp } from '@/components/ui/bidi'
import { RegisterFilterBar } from '@/components/registry/register-filters'

/**
 * The register, as a list.
 *
 * The public verification page answers one question about one number. This is
 * the other half of REQ-REG-061 — the Authority's own view of the population it
 * supervises, searchable by name, by governorate, by category, by standing.
 *
 * ── Why it needs a session ───────────────────────────────────────────────
 *
 * Verification takes a number a counterparty has already been shown and
 * confirms it. Search takes no number and returns names. A public, filterable
 * list of every registered broker with their governorate and category is a
 * marketing database — and 00-VISION §8 rules out this product being a
 * marketplace in as many words. It would also let anyone enumerate the whole
 * supervised population, which is exactly what the one-answer design of the
 * public lookup exists to prevent.
 *
 * ── Sorted by what runs out next ─────────────────────────────────────────
 *
 * Not alphabetically. The question an officer opens this screen with is almost
 * always "what needs attention", and in a register of time-limited entries that
 * is whichever expires soonest. A name search returns one row and makes the
 * ordering moot.
 */
export default async function RegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { locale } = await params
  const query = await searchParams
  setRequestLocale(locale)

  const gate = await guard(
    ['REGISTRY_CLERK', 'EXAMINER', 'REVIEWER', 'CARD_ISSUER', 'DATA_MANAGER', 'FILES_HEAD', 'AML_SUPERVISOR', 'INSPECTOR', 'ANALYST', 'AUDITOR'],
    { caseData: true },
  )
  if (!gate.ok) return <AccessRefused result={gate} locale={locale as Locale} />

  const session = gate.session
  const loc = locale as Locale
  const t = await getTranslations('register')

  const filters = readFilters(query)
  const request = readPage(query)

  const [{ rows, total }, summary] = await Promise.all([
    searchRegister({ filters, page: request }),
    registerSummary(filters),
  ])

  const info = pageInfo(request, total, rows.length)

  // REQ-DPA-002 — reads are audited, and a search is a read. The filters are
  // recorded rather than the results: the intent is what an inspector asks
  // about, and a list of every row on somebody's page four would bloat the
  // trail without answering anything.
  await recordRegisterSearch({
    actorUserId: session.userId,
    actorRole: session.role,
    actorLabel: `${session.name} (${roleLabel(session.role).en})`,
    filters,
    resultCount: total,
    ipAddress: session.ipAddress,
    userAgent: session.userAgent,
  })

  return (
    <Shell locale={loc} session={session}>
      <PageHeader
        title={t('title')}
        lead={t('lead')}
        meta={
          <>
            <Status tone="neutral">{t('countAll', { count: summary.ALL })}</Status>
            {summary.RENEWAL_DUE > 0 ? (
              <Status tone="caution">{t('countRenewalDue', { count: summary.RENEWAL_DUE })}</Status>
            ) : null}
            {summary.LAPSED > 0 ? (
              <Status tone="blocking">{t('countLapsed', { count: summary.LAPSED })}</Status>
            ) : null}
          </>
        }
      />

      <RegisterFilterBar
        current={{
          q: filters.q ?? '',
          status: filters.status ?? '',
          category: filters.category ?? '',
          type: filters.type ?? '',
          governorate: filters.governorate ?? '',
        }}
        governorates={Object.entries(governorateLabels).map(([value, label]) => ({
          value,
          label: loc === 'ar' ? label.ar : label.en,
        }))}
      />

      <Panel flush className="mt-6">
        <Table caption={t('title')} layout="fixed" minWidth="62rem">
          <thead>
            <tr>
              <Th className="w-40">{t('colNumber')}</Th>
              <Th className="w-auto">{t('colName')}</Th>
              <Th className="w-20">{t('colCategory')}</Th>
              <Th className="w-36">{t('colTypes')}</Th>
              <Th className="w-32">{t('colGovernorate')}</Th>
              <Th className="w-28">{t('colValidTo')}</Th>
              <Th className="w-32">{t('colStatus')}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <TableEmptyRow colSpan={7}>
                <EmptyState
                  icon={FileSearch}
                  title={t('emptyTitle')}
                  description={t('emptyLead')}
                  size="sm"
                />
              </TableEmptyRow>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  {/* The table is `layout="fixed"`, so this column is exactly
                      as wide as its header says and nothing the cell declares
                      changes that. A registration number is `.ltr-run`, which
                      does not wrap — one broken across two lines is one
                      somebody mistypes — so anything wider than the column
                      overflows it and lands on top of the Arabic trade name in
                      the next column. Clipping is what keeps that legible: an
                      issued number (`2026/0001`) fits with room to spare, and
                      the pathological case degrades to an ellipsis with the
                      full value still on the element and in the link. */}
                  <Td className="overflow-hidden">
                    <Link
                      href={`/verify?number=${encodeURIComponent(row.registrationNumber)}`}
                      title={row.registrationNumber}
                      className="block truncate font-medium text-navy-600 underline-offset-2 hover:underline"
                    >
                      <Ltr>{row.registrationNumber}</Ltr>
                    </Link>
                  </Td>
                  <Td>
                    <bdi className="font-medium">{row.tradeNameAr}</bdi>
                    {row.tradeNameEn ? (
                      <span className="ltr-run mt-0.5 block truncate text-2xs text-ink-faint">
                        {row.tradeNameEn}
                      </span>
                    ) : null}
                  </Td>
                  <Td numeric>
                    <span className="ltr-run font-semibold">{row.category}</span>
                  </Td>
                  <Td className="text-xs">
                    <span className="ltr-run">{row.types.join(', ')}</span>
                  </Td>
                  <Td className="text-xs">
                    <bdi>
                      {row.governorate
                        ? loc === 'ar'
                          ? governorateLabels[row.governorate].ar
                          : governorateLabels[row.governorate].en
                        : '—'}
                    </bdi>
                  </Td>
                  <Td>
                    <Stamp value={row.validTo} className="text-xs" />
                    {/* The number that decides whether this row needs anything
                        doing to it, beside the date rather than instead of it. */}
                    <span
                      className={
                        row.daysToExpiry < 0
                          ? 'mt-0.5 block text-2xs font-medium text-blocking'
                          : row.daysToExpiry <= 90
                            ? 'mt-0.5 block text-2xs font-medium text-caution'
                            : 'mt-0.5 block text-2xs text-ink-faint'
                      }
                    >
                      {row.daysToExpiry < 0
                        ? t('expiredDaysAgo', { days: Math.abs(row.daysToExpiry) })
                        : t('daysRemaining', { days: row.daysToExpiry })}
                    </span>
                  </Td>
                  <Td>
                    <Status tone={statusTone(row.status)} size="sm">
                      {t(`status${row.status}` as 'statusACTIVE')}
                    </Status>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>

        <Pagination
          info={info}
          basePath="/register"
          searchParams={query}
          locale={loc}
          labels={{
            showing: t('showing', { first: info.firstRow, last: info.lastRow, total: info.total }),
            previous: t('previousPage'),
            next: t('nextPage'),
            page: t('pagination'),
            perPage: t('perPage'),
            empty: t('emptyTitle'),
          }}
        />
      </Panel>
    </Shell>
  )
}

function statusTone(status: RegistrationStatus) {
  switch (status) {
    case 'ACTIVE':
      return 'confirmed' as const
    case 'RENEWAL_DUE':
      return 'caution' as const
    case 'LAPSED':
    case 'CANCELLED':
      return 'blocking' as const
    case 'SUSPENDED':
      return 'informational' as const
  }
}

/**
 * Read the filters out of the URL.
 *
 * Every value is validated against its enum rather than trusted, and an
 * unrecognised one is dropped rather than refused: a stale bookmark with a
 * governorate that has been renamed should show the register, not an error.
 */
function readFilters(query: Record<string, string | string[] | undefined>): RegisterFilters {
  const one = (key: string): string | undefined => {
    const value = query[key]
    const single = Array.isArray(value) ? value[0] : value
    return single?.trim() || undefined
  }

  const statuses: RegistrationStatus[] = ['ACTIVE', 'RENEWAL_DUE', 'LAPSED', 'SUSPENDED', 'CANCELLED']
  const categories: BrokerCategory[] = ['A', 'B', 'C', 'D']
  const types: BrokerType[] = ['SELL', 'BUY', 'DUAL', 'RENTAL']

  const status = one('status')
  const category = one('category')
  const type = one('type')
  const governorate = one('governorate')

  return {
    q: one('q') ?? null,
    status: statuses.includes(status as RegistrationStatus) ? (status as RegistrationStatus) : null,
    category: categories.includes(category as BrokerCategory) ? (category as BrokerCategory) : null,
    type: types.includes(type as BrokerType) ? (type as BrokerType) : null,
    governorate:
      governorate && governorate in governorateLabels ? (governorate as Governorate) : null,
  }
}
