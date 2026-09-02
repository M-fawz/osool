import type { SignalFamily, SignalSeverity, SignalState } from '@prisma/client'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { guard } from '@/lib/auth/guard'
import { AccessRefused } from '@/components/layout/access-refused'
import { Shell } from '@/components/layout/shell'
import { Link } from '@/i18n/navigation'
import type { Locale } from '@/i18n/routing'
import { recordAuditEvent } from '@/lib/audit'
import { roleLabel } from '@/lib/auth/roles'
import { ruleSet } from '@/lib/rules'
import { loadSignals } from '@/lib/signals'
import { pageInfo, readPage } from '@/lib/pagination'
import {
  EmptyState,
  Notice,
  PageHeader,
  Panel,
  Status,
} from '@/components/ui/primitives'
import { Pagination } from '@/components/ui/pagination'
import { ShieldCheck } from '@/components/ui/icon'
import { Stamp } from '@/components/ui/bidi'
import { SignalCard } from '@/components/gov/signal-card'

/**
 * The signals queue.
 *
 * 02-SYSTEM-ARCHITECTURE §8: "The interface must say this in words, on the
 * screen — not just in documentation." So the sentence that a signal is triage
 * and not a finding is the first thing on the page, in a notice, above the
 * list — not a footnote under it, and not only in a comment in the source.
 *
 * ── Who sees what ────────────────────────────────────────────────────────
 *
 * The AML supervisor's function under §4 is the supervised population; the
 * internal auditor's is everything. So the family filter defaults differently
 * per role rather than showing everyone the same queue and hoping they filter
 * it themselves — an AML supervisor opening this screen should land on their
 * own work.
 *
 * `ANALYST` may read the queue (their function is signals in aggregate) and the
 * disposition controls are not rendered for them; the Server Action refuses
 * them independently, which is the control.
 *
 * ── Sorted most severe, then oldest ──────────────────────────────────────
 *
 * A HIGH signal from last week outranks a LOW one from this morning, and within
 * a severity the one that has waited longest comes first — the same reasoning
 * as the workflow queues, for the same reason: a list that buries what has been
 * waiting is a list where things wait.
 */
export default async function SupervisionPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { locale } = await params
  const query = await searchParams
  setRequestLocale(locale)

  const gate = await guard(['AML_SUPERVISOR', 'AUDITOR', 'ANALYST'], { caseData: true })
  if (!gate.ok) return <AccessRefused result={gate} locale={locale as Locale} />

  const session = gate.session
  const loc = locale as Locale
  const t = await getTranslations('supervision')

  const one = (key: string): string | undefined => {
    const value = query[key]
    const single = Array.isArray(value) ? value[0] : value
    return single?.trim() || undefined
  }

  const states: SignalState[] = ['OPEN', 'UNDER_REVIEW', 'DISMISSED_WITH_REASON', 'ESCALATED']
  const families: SignalFamily[] = ['SUPERVISED_POPULATION', 'PROCESS_INTEGRITY']
  const severities: SignalSeverity[] = ['HIGH', 'MEDIUM', 'LOW']

  const stateParam = one('state')
  const familyParam = one('family')
  const severityParam = one('severity')

  const filters = {
    // Open by default: this is a worklist, and a worklist that opens on
    // everything ever raised is an archive.
    state: stateParam === 'ALL' ? null : states.includes(stateParam as SignalState) ? (stateParam as SignalState) : ('OPEN' as SignalState),
    family: families.includes(familyParam as SignalFamily)
      ? (familyParam as SignalFamily)
      : defaultFamilyFor(session.role),
    severity: severities.includes(severityParam as SignalSeverity)
      ? (severityParam as SignalSeverity)
      : null,
  }

  const request = readPage(query, { defaultSize: 25 })
  const { rows, total } = await loadSignals({
    filters,
    page: { skip: request.skip, take: request.take },
  })
  const info = pageInfo(request, total, rows.length)

  // The parameters the detectors ran under, so the screen can name the label
  // and the basis of each signal from the same versioned source the engine
  // used — rather than a second copy of the wording in a message file.
  const parameters = await ruleSet<Record<string, unknown>>('INTEGRITY_SIGNALS', {
    asOf: new Date(),
  })
  const byKey = new Map(parameters.items.map((item) => [item.key, item.payload]))

  await recordAuditEvent({
    accessType: 'READ',
    action: 'SIGNAL_QUEUE_VIEWED',
    entityType: 'Signal',
    actorUserId: session.userId,
    actorRole: session.role,
    actorLabel: `${session.name} (${roleLabel(session.role).en})`,
    reason: 'Signals queue opened.',
    ipAddress: session.ipAddress,
    userAgent: session.userAgent,
    payload: { state: filters.state, family: filters.family, severity: filters.severity },
  })

  const canDispose = session.role === 'AML_SUPERVISOR' || session.role === 'AUDITOR'

  return (
    <Shell locale={loc} session={session}>
      <PageHeader
        title={t('title')}
        lead={t('lead')}
        meta={<Status tone="neutral">{t('countOpen', { count: total })}</Status>}
      />

      {/* §8, in words, on the screen. First, not last. */}
      <Notice tone="informational" title={t('notAnAccusationTitle')} className="mb-6">
        <p>{t('notAnAccusationLead')}</p>
        <p className="mt-2">{t('notAnAccusationSecond')}</p>
      </Notice>

      <Panel className="mb-6">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <FilterSelect
            name="state"
            label={t('filterState')}
            value={stateParam ?? 'OPEN'}
            options={[
              { value: 'OPEN', label: t('stateOPEN') },
              { value: 'UNDER_REVIEW', label: t('stateUNDER_REVIEW') },
              { value: 'DISMISSED_WITH_REASON', label: t('stateDISMISSED_WITH_REASON') },
              { value: 'ESCALATED', label: t('stateESCALATED') },
              { value: 'ALL', label: t('filterAll') },
            ]}
          />
          <FilterSelect
            name="family"
            label={t('filterFamily')}
            value={familyParam ?? (filters.family ?? '')}
            options={[
              { value: '', label: t('filterAll') },
              { value: 'SUPERVISED_POPULATION', label: t('familySUPERVISED_POPULATION') },
              { value: 'PROCESS_INTEGRITY', label: t('familyPROCESS_INTEGRITY') },
            ]}
          />
          <FilterSelect
            name="severity"
            label={t('filterSeverity')}
            value={severityParam ?? ''}
            options={[
              { value: '', label: t('filterAll') },
              { value: 'HIGH', label: t('severityHIGH') },
              { value: 'MEDIUM', label: t('severityMEDIUM') },
              { value: 'LOW', label: t('severityLOW') },
            ]}
          />
          <button
            type="submit"
            className="inline-flex h-9 items-center rounded-xs bg-navy-600 px-3.5 text-sm font-medium text-paper hover:bg-navy-700"
          >
            {t('applyFilters')}
          </button>
        </form>
      </Panel>

      {rows.length === 0 ? (
        <Panel>
          <EmptyState
            icon={ShieldCheck}
            title={t('emptyTitle')}
            description={t('emptyLead')}
          />
        </Panel>
      ) : (
        <div className="space-y-3">
          {rows.map((signal) => {
            const payload = byKey.get(signal.signalType) ?? {}
            const evidence = signal.evidence as Record<string, unknown>

            return (
              <SignalCard
                key={signal.id}
                signal={{
                  id: signal.id,
                  signalType: signal.signalType,
                  title:
                    loc === 'ar'
                      ? String(payload.labelAr ?? signal.signalType)
                      : String(payload.labelEn ?? signal.signalType),
                  summary:
                    loc === 'ar'
                      ? String(evidence.summaryAr ?? '')
                      : String(evidence.summaryEn ?? ''),
                  family: signal.family,
                  severity: signal.severity,
                  state: signal.state,
                  detectedAt: signal.detectedAt.toISOString(),
                  // Whether the threshold behind this signal is a decree or a
                  // parameter the Authority set. The distinction is on the card
                  // because a supervisor acting on it must know which they are
                  // looking at — see prisma/rule-sets/integrity-signals.ts.
                  basis: payload.basis === 'LEGAL' ? 'LEGAL' : 'OPERATIONAL',
                  evidence,
                  applicationId: signal.applicationId,
                  applicationRef: signal.application?.temporaryNumber ?? null,
                  firmName:
                    signal.application?.entityData?.tradeNameAr ??
                    signal.application?.brokerEntity.tradeNameAr ??
                    null,
                  dispositionReason: signal.dispositionReason,
                  disposedByName:
                    signal.disposedBy?.nameAr ?? signal.disposedBy?.name ?? null,
                }}
                canDispose={canDispose}
                locale={loc}
              />
            )
          })}

          <Panel flush>
            <Pagination
              info={info}
              basePath="/supervision"
              searchParams={query}
              locale={loc}
              labels={{
                showing: t('showing', {
                  first: info.firstRow,
                  last: info.lastRow,
                  total: info.total,
                }),
                previous: t('previousPage'),
                next: t('nextPage'),
                page: t('pagination'),
                perPage: t('perPage'),
                empty: t('emptyTitle'),
              }}
            />
          </Panel>
        </div>
      )}

      <p className="mt-6 text-xs text-ink-faint">
        {t('rulesetNote', { version: parameters.version })}{' '}
        <Stamp value={new Date()} withTime className="text-xs" />
      </p>

      {session.role === 'AUDITOR' ? (
        <p className="mt-2 text-xs text-ink-faint">
          <Link href="/audit" className="text-navy-600 underline-offset-2 hover:underline">
            {t('auditLink')}
          </Link>
        </p>
      ) : null}
    </Shell>
  )
}

/** The queue a role should land on, before they filter it themselves. */
function defaultFamilyFor(role: string): SignalFamily | null {
  if (role === 'AML_SUPERVISOR') return 'SUPERVISED_POPULATION'
  // The auditor's function is the whole picture; the analyst works in
  // aggregate. Neither gets a narrowed default.
  return null
}

function FilterSelect({
  name,
  label,
  value,
  options,
}: {
  name: string
  label: string
  value: string
  options: Array<{ value: string; label: string }>
}) {
  return (
    <label className="flex min-w-40 flex-col gap-1">
      <span className="text-2xs font-semibold uppercase tracking-wider text-ink-faint">{label}</span>
      <select
        name={name}
        defaultValue={value}
        className="h-9 rounded-xs border border-rule bg-paper px-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-navy-600"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
