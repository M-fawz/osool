import { getTranslations } from 'next-intl/server'
import type { Locale } from '@/i18n/routing'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/cn'
import {
  completionCategoryLabels,
  type ReturnHistory,
  type ReturnedItem,
} from '@/lib/applications/returns'
import { Panel } from '@/components/ui/panel'
import { Notice } from '@/components/ui/notice'
import { Status } from '@/components/ui/status'
import { Stamp } from '@/components/ui/bidi'
import { Check, Icon, Minus, AlertTriangle } from '@/components/ui/icon'

/**
 * What the Authority sent back, and what to do about it.
 *
 * The screen a returned application deserves and did not have. Before this, a
 * broker whose file came back saw the word "AWAITING_COMPLETION" and a count;
 * every item was already in the database, itemised, and none of it was on any
 * screen. They had to telephone to find out what was wrong.
 *
 * ── The four questions, in the order they are asked ──────────────────────
 *
 * A returned file produces four questions and they arrive in a fixed order, so
 * the layout answers them in that order rather than by importance to us:
 *
 *   1. **Am I in trouble?** — answered first and explicitly, in the notice at
 *      the top: this is not a refusal, the file is held as it stands.
 *   2. **What is wrong?** — every outstanding item, grouped by the part of the
 *      file it belongs to. Grouping matters more than it looks: a broker fixing
 *      three documents goes to the documents step once, and a flat list of
 *      seven items sends them back and forth.
 *   3. **What do I have to do?** — the required correction, in its own line,
 *      visually separated from the problem. They are different sentences.
 *   4. **What have I already done?** — satisfied items, kept on the screen and
 *      ticked rather than vanishing, because an applicant who cannot see their
 *      own progress cannot tell whether the work took.
 *
 * ── Two things deliberately not done ─────────────────────────────────────
 *
 * No colour-only status. Every item carries a drawn icon and a text label —
 * 03-DESIGN-DIRECTION §7, and these decisions have consequences.
 *
 * No internal vocabulary. The word "completion" is the register's word, from
 * الاستيفاءات on the paper form; on the applicant's screen the heading says
 * what is needed rather than what the table is called.
 */

export async function ReturnedItems({
  history,
  applicationId,
  locale,
  /** Government screens show every round; the applicant sees what is theirs. */
  variant = 'applicant',
}: {
  history: ReturnHistory
  applicationId: string
  locale: Locale
  variant?: 'applicant' | 'officer'
}) {
  const t = await getTranslations('returns')

  if (history.timesReturned === 0) {
    if (variant === 'officer') {
      return (
        <Panel title={t('historyTitle')}>
          <p className="text-sm text-ink-muted">{t('neverReturned')}</p>
        </Panel>
      )
    }
    return null
  }

  const outstanding = history.outstandingTotal
  const resolved = history.satisfiedTotal

  return (
    <div className="space-y-4">
      {/* 1 — Am I in trouble? Stated before anything else, because it is the
          question the applicant is actually holding while they read. */}
      {history.awaitingApplicant ? (
        <Notice tone="caution" title={t('returnedTitle')}>
          {/* Two versions of one sentence, because only one of them is true.
              `requiredCorrectionAr` arrived with the categorised composer, so
              items raised before it carry only a description of the fault.
              Promising "and what is needed" above a list that does not say
              what is needed is the kind of small lie that makes an applicant
              distrust the rest of the screen. */}
          <p>
            {history.outstandingHasCorrections
              ? t('returnedLead', { count: outstanding })
              : t('returnedLeadFaultOnly', { count: outstanding })}
          </p>
          <p className="mt-2">{t('notARefusal')}</p>
        </Notice>
      ) : outstanding > 0 ? (
        <Notice tone="informational" title={t('withAuthorityTitle')}>
          {t('withAuthorityLead', { count: outstanding })}
        </Notice>
      ) : (
        <Notice tone="confirmed" title={t('allDoneTitle')}>
          {t('allDoneLead', { count: resolved })}
        </Notice>
      )}

      {/* A standing count, so "how much is left" never requires arithmetic. */}
      <Panel>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Tally label={t('tallyOutstanding')} value={outstanding} tone="caution" />
          <Tally label={t('tallyFixed')} value={resolved} tone="confirmed" />
          <Tally label={t('tallyTimesReturned')} value={history.timesReturned} tone="neutral" />
          <Tally
            label={t('tallyTotal')}
            value={history.rounds.reduce((sum, round) => sum + round.items.length, 0)}
            tone="neutral"
          />
        </dl>
      </Panel>

      {/* 2 and 3 — what is wrong, and what to do, grouped by where it lives. */}
      {history.outstandingByCategory.length > 0 ? (
        <Panel title={t('outstandingTitle')} description={t('outstandingLead')}>
          <div className="space-y-6">
            {history.outstandingByCategory.map((group) => (
              <section key={group.category}>
                <h3 className="mb-2 flex items-center gap-2 text-2xs font-semibold uppercase tracking-wider text-ink-faint">
                  {locale === 'ar'
                    ? completionCategoryLabels[group.category].ar
                    : completionCategoryLabels[group.category].en}
                  <span className="rounded-xs bg-caution-soft px-1.5 py-0.5 text-2xs font-semibold tabular-nums text-caution">
                    {group.items.length}
                  </span>
                </h3>

                <ul className="space-y-2">
                  {group.items.map((item) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      locale={locale}
                      labels={{
                        needed: t('whatIsNeeded'),
                        basis: t('basis'),
                        askedBy: t('askedBy'),
                        round: t('roundLabel'),
                        field: t('fieldLabel'),
                      }}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>

          {variant === 'applicant' && history.awaitingApplicant ? (
            <div className="mt-6 border-t border-rule pt-4">
              <p className="mb-3 max-w-reading text-sm text-ink-muted">{t('howToFix')}</p>
              <Link
                href={`/application/${applicationId}/documents`}
                className="inline-flex h-11 items-center rounded-xs bg-navy-600 px-5 text-base font-semibold text-paper transition-colors hover:bg-navy-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-600"
              >
                {t('goAndFix')}
              </Link>
            </div>
          ) : null}
        </Panel>
      ) : null}

      {/* 4 — what has already been dealt with, and the history behind it. */}
      <Panel title={t('historyTitle')} description={t('historyLead')}>
        <ol className="space-y-5">
          {history.rounds.map((round) => (
            <li key={round.round}>
              <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className="text-sm font-semibold text-navy-700">
                  {t('roundHeading', { round: round.round })}
                </h3>
                <Stamp value={round.requestedAt} withTime className="text-xs text-ink-muted" />
                {round.requestedByName ? (
                  <span className="text-xs text-ink-faint">
                    <bdi>{round.requestedByName}</bdi>
                  </span>
                ) : null}
                <span className="text-xs tabular-nums text-ink-muted">
                  {t('roundTally', {
                    outstanding: round.outstanding,
                    satisfied: round.satisfied,
                    total: round.items.length,
                  })}
                </span>
              </div>

              <ul className="space-y-1.5 border-s-2 border-rule ps-3">
                {round.items.map((item) => (
                  <li key={item.id} className="flex items-start gap-2 text-sm">
                    <StatusMark status={item.status} />
                    <span className="min-w-0">
                      <bdi
                        className={cn(
                          item.status !== 'REQUESTED' && 'text-ink-muted',
                        )}
                      >
                        {locale === 'ar' ? item.problemAr : (item.problemEn ?? item.problemAr)}
                      </bdi>
                      {item.status === 'WAIVED' && item.resolutionReason ? (
                        <span className="mt-0.5 block text-xs text-ink-faint">
                          {t('waivedBecause')}: <bdi>{item.resolutionReason}</bdi>
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  )
}

function Tally({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'caution' | 'confirmed' | 'neutral'
}) {
  const colour =
    tone === 'caution'
      ? 'text-caution'
      : tone === 'confirmed'
        ? 'text-confirmed'
        : 'text-navy-700'

  return (
    <div>
      <dt className="text-2xs font-semibold uppercase tracking-wider text-ink-faint">{label}</dt>
      <dd className={cn('mt-0.5 text-2xl font-semibold tabular-nums', colour)}>{value}</dd>
    </div>
  )
}

function StatusMark({ status }: { status: ReturnedItem['status'] }) {
  if (status === 'SATISFIED') {
    return (
      <Icon as={Check} size="sm" className="mt-0.5 shrink-0 text-confirmed" title="Done" />
    )
  }
  if (status === 'WAIVED') {
    return <Icon as={Minus} size="sm" className="mt-0.5 shrink-0 text-ink-faint" title="Waived" />
  }
  return (
    <Icon
      as={AlertTriangle}
      size="sm"
      className="mt-0.5 shrink-0 text-caution"
      title="Outstanding"
    />
  )
}

/**
 * One returned item.
 *
 * The problem and the required correction are two visually distinct lines, not
 * one paragraph. That separation is the whole reason this component exists: on
 * the paper form they are one column of free text, and the result is an
 * applicant who knows something is wrong with their commercial register and not
 * whether to rescan it, replace it, or renew it.
 */
function ItemCard({
  item,
  locale,
  labels,
}: {
  item: ReturnedItem
  locale: Locale
  labels: { needed: string; basis: string; askedBy: string; round: string; field: string }
}) {
  const problem = locale === 'ar' ? item.problemAr : (item.problemEn ?? item.problemAr)
  const correction =
    locale === 'ar'
      ? item.requiredCorrectionAr
      : (item.requiredCorrectionEn ?? item.requiredCorrectionAr)

  return (
    <li className="border-s-2 border-caution bg-caution-soft/40 p-3">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-base font-medium text-ink">
          <span className="me-1.5 text-xs tabular-nums text-ink-faint">
            {item.itemNumber}.
          </span>
          <bdi>{problem}</bdi>
        </p>
        <Status tone="caution" size="sm">
          {labels.round} {item.round}
        </Status>
      </div>

      {correction ? (
        <p className="mt-2 border-s-2 border-navy-200 ps-2.5 text-sm text-ink">
          <span className="me-1 font-semibold text-navy-700">{labels.needed}:</span>
          <bdi>{correction}</bdi>
        </p>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-ink-faint">
        {item.legalReference ? (
          <span>
            {labels.basis}: <span className="ltr-run font-medium">{item.legalReference}</span>
          </span>
        ) : null}
        {item.fieldKey ? (
          <span>
            {labels.field}: <span className="ltr-run font-medium">{item.fieldKey}</span>
          </span>
        ) : null}
        {item.requestedByName ? (
          <span>
            {labels.askedBy}: <bdi>{item.requestedByName}</bdi>
          </span>
        ) : null}
      </div>
    </li>
  )
}
