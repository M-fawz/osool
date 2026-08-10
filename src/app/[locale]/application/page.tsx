import { getTranslations, setRequestLocale } from 'next-intl/server'
import { guard } from '@/lib/auth/guard'
import { AccessRefused } from '@/components/layout/access-refused'
import { PortalShell } from '@/components/layout/portal-shell'
import { BROKER_ROLES } from '@/lib/auth/roles'
import { db } from '@/lib/db'
import { loadBrokerApplications } from '@/lib/applications/queues'
import { evaluateCompleteness, loadApplicationDetail } from '@/lib/applications/completeness'
import { statusLabels } from '@/lib/applications/refusals'
import { resolveDocumentChecklist } from '@/lib/rules/documents'
import type { Locale } from '@/i18n/routing'
import { Link } from '@/i18n/navigation'
import { EmptyState, PageHeader, Panel } from '@/components/ui/panel'
import { Notice } from '@/components/ui/notice'
import { Status, type StatusTone } from '@/components/ui/status'
import { Ltr, Stamp } from '@/components/ui/bidi'
import { ClipboardList, Icon, forwardChevron } from '@/components/ui/icon'
import { StartApplicationButton } from '@/components/application/start-application-button'
import type { ApplicationStatus } from '@prisma/client'

/**
 * The broker's landing screen.
 *
 * A broker uses this system two or three times in their life, so this page has
 * to do the work an induction would do: say what the register is for, say what
 * to have ready before starting, and then get out of the way. Once there is an
 * application it becomes a status page, because from that point the only
 * question is "where has it got to".
 *
 * The list is the honest one: an incomplete application says how much of it is
 * left, in steps, computed by the same evaluation the server enforces at
 * submission.
 */

/** Status → tone. Every status also renders its own word and icon (§7). */
const TONES: Record<ApplicationStatus, StatusTone> = {
  DRAFT: 'neutral',
  SUBMITTED: 'informational',
  UNDER_INTAKE: 'informational',
  UNDER_EXAMINATION: 'informational',
  AWAITING_COMPLETION: 'caution',
  UNDER_REVIEW: 'informational',
  APPROVED: 'confirmed',
  REJECTED: 'blocking',
  AWAITING_PAYMENT: 'caution',
  CARD_ISSUED: 'confirmed',
  ACTIVE: 'confirmed',
  WITHDRAWN: 'neutral',
}

export default async function ApplicationsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)

  const gate = await guard(BROKER_ROLES, { caseData: true })
  if (!gate.ok) return <AccessRefused result={gate} locale={locale as Locale} />

  const session = gate.session
  const loc = locale as Locale
  const t = await getTranslations('portal')

  const entity = session.brokerEntityId
    ? await db.brokerEntity.findUnique({
        where: { id: session.brokerEntityId },
        select: { tradeNameAr: true, tradeNameEn: true },
      })
    : null

  const applications = session.brokerEntityId
    ? await loadBrokerApplications(session.brokerEntityId)
    : []

  // Progress is only meaningful while a file is still the applicant's to
  // finish, so it is computed for drafts and for files awaiting completions —
  // and not for the ten other states where the answer would be a distraction.
  const progress = new Map<string, { done: number; total: number }>()
  for (const application of applications) {
    if (application.status !== 'DRAFT' && application.status !== 'AWAITING_COMPLETION') continue
    const detail = await loadApplicationDetail(application.id)
    if (!detail) continue
    const completeness = await evaluateCompleteness(detail)
    progress.set(application.id, {
      done: completeness.completedSteps,
      total: completeness.totalSteps,
    })
  }

  const firmName = entity
    ? loc === 'ar'
      ? entity.tradeNameAr
      : (entity.tradeNameEn ?? entity.tradeNameAr)
    : null

  return (
    <PortalShell locale={loc} session={session} firmName={firmName}>
      <PageHeader
        title={t('title')}
        lead={t('lead')}
        meta={firmName ? <p className="text-sm text-ink-muted">{t('signedInAs', { name: firmName })}</p> : null}
      />

      {applications.length === 0 ? (
        <FirstRun locale={loc} />
      ) : (
        <div className="space-y-4">
          {applications.map((application) => {
            const steps = progress.get(application.id)
            const label = statusLabels[application.status]
            const name =
              application.entityData?.tradeNameAr ?? entity?.tradeNameAr ?? t('noNumberYet')

            return (
              <Panel key={application.id}>
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
                  <div className="min-w-0">
                    <p className="text-2xs font-semibold uppercase tracking-wider text-ink-faint">
                      {t('colRef')}
                    </p>
                    <p className="mt-0.5 text-lg font-semibold text-navy-700">
                      {application.temporaryNumber ? (
                        <Ltr>{application.temporaryNumber}</Ltr>
                      ) : (
                        <span className="text-base font-normal text-ink-muted">
                          {t('noNumberYet')}
                        </span>
                      )}
                    </p>
                    <bdi className="mt-1 block text-sm text-ink-muted">{name}</bdi>
                  </div>

                  <Status tone={TONES[application.status]}>{label[loc]}</Status>
                </div>

                {steps ? (
                  <p className="mt-3 text-sm text-ink-muted">
                    {t('draftProgress', { done: steps.done, total: steps.total })}
                  </p>
                ) : null}

                {application._count.completions > 0 ? (
                  <Notice tone="caution" className="mt-3">
                    {t('completionsWaiting', { count: application._count.completions })}
                  </Notice>
                ) : null}

                {application.registration ? (
                  <p className="mt-3 text-sm text-ink-muted">
                    {t('registrationNumber')}:{' '}
                    <Ltr className="font-medium text-ink">
                      {application.registration.registrationNumber}
                    </Ltr>
                  </p>
                ) : null}

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-3">
                  <p className="text-xs text-ink-faint">
                    {t('colUpdated')}: <Stamp value={application.updatedAt} />
                  </p>
                  <Link
                    href={
                      application.status === 'DRAFT' || application.status === 'AWAITING_COMPLETION'
                        ? `/application/${application.id}/review`
                        : `/application/${application.id}/review`
                    }
                    className="inline-flex min-h-11 items-center gap-1.5 text-base font-medium text-navy-600 hover:underline"
                  >
                    {application.status === 'DRAFT' ? t('resume') : t('openApplication')}
                    <Icon as={forwardChevron(loc)} size="sm" />
                  </Link>
                </div>
              </Panel>
            )
          })}

          <div className="pt-2">
            <StartApplicationButton label={t('startNew')} />
          </div>
        </div>
      )}
    </PortalShell>
  )
}

/**
 * The first-run screen.
 *
 * The most important thing on it is not the button — it is the list of papers
 * to have ready. A broker who starts the flow and discovers at step 6 that
 * their tax card is in a drawer at the office abandons the application, and the
 * abandonment looks like a system failure rather than a preparation failure.
 * The list is read from DOC_CHECKLIST so it cannot drift from what step 6
 * actually asks for.
 */
async function FirstRun({ locale }: { locale: Locale }) {
  const t = await getTranslations('portal')
  const checklist = await resolveDocumentChecklist(
    { establishmentType: 'NATURAL_PERSON', capacity: null },
    { asOf: new Date() },
  )

  return (
    <div className="space-y-6">
      <Panel flush>
        <EmptyState
          icon={ClipboardList}
          title={t('emptyTitle')}
          description={t('emptyLead')}
          action={<StartApplicationButton label={t('startFirst')} />}
        />
      </Panel>

      <Panel title={t('helpTitle')} description={t('helpLead')}>
        <ul className="space-y-2">
          {checklist.required.map((item) => (
            <li key={item.key} className="flex items-start gap-2 text-base text-ink">
              <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 bg-brass-500" />
              <span>{locale === 'ar' ? item.payload.labelAr : item.payload.labelEn}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 space-y-2 border-t border-rule pt-4 text-sm text-ink-muted">
          <p>{t('helpTime')}</p>
          <p>{t('helpNoPayment')}</p>
        </div>
      </Panel>
    </div>
  )
}
