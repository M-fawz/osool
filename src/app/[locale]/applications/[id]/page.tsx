import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { guard } from '@/lib/auth/guard'
import { AccessRefused } from '@/components/layout/access-refused'
import { Shell } from '@/components/layout/shell'
import { db } from '@/lib/db'
import { auditedRead } from '@/lib/auth/session'
import { personName } from '@/lib/auth/roles'
import { loadApplicationDetail } from '@/lib/applications/completeness'
import { QUEUE_ROUTES } from '@/lib/applications/queues'
import type { Locale } from '@/i18n/routing'
import { KeyValue, KeyValueItem, Panel } from '@/components/ui/panel'
import { Notice } from '@/components/ui/notice'
import { Ltr, Stamp } from '@/components/ui/bidi'
import { CaseHeader } from '@/components/gov/case-header'
import { CaseSummary } from '@/components/gov/case-summary'
import { EventTrail } from '@/components/gov/event-trail'
import { ArchiveForm, DataExtractionForm } from '@/components/gov/file-handling-forms'
import { AssignExaminerForm, IntakeForm } from '@/components/gov/issuance-forms'

/**
 * The case file, for the roles whose step is a single act.
 *
 * The registry clerk, the data manager, the head of files, and the auditor all
 * need the same thing — the file, its trail, and at most one form. Giving each
 * of them a bespoke screen would have produced four pages that were the same
 * page, so the action panel is chosen from the signed-in role and the file
 * itself is identical for all of them.
 *
 * The examiner, the reviewer, and the card issuer have their own screens,
 * because their steps are not a single act.
 */
export default async function CaseFilePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { locale, id } = await params
  setRequestLocale(locale)

  const gate = await guard(
    ['REGISTRY_CLERK', 'DATA_MANAGER', 'FILES_HEAD', 'AUDITOR', 'EXAMINER', 'REVIEWER', 'CARD_ISSUER'],
    { caseData: true },
  )
  if (!gate.ok) return <AccessRefused result={gate} locale={locale as Locale} />

  const session = gate.session
  const loc = locale as Locale

  const application = await auditedRead(
    session,
    { entityType: 'Application', entityId: id, action: 'APPLICATION_VIEWED' },
    () => loadApplicationDetail(id),
  )

  if (!application) notFound()

  const t = await getTranslations('gov')

  const [examiners, fileHandling, issuance] = await Promise.all([
    session.role === 'REGISTRY_CLERK'
      ? db.user.findMany({
          where: { role: 'EXAMINER', status: 'ACTIVE', archivedAt: null },
          select: { id: true, name: true, nameAr: true },
          orderBy: { name: 'asc' },
        })
      : Promise.resolve([]),
    db.fileHandlingRecord.findUnique({
      where: { applicationId: id },
      include: {
        dataExtractedBy: { select: { name: true, nameAr: true } },
        archivedByUser: { select: { name: true, nameAr: true } },
      },
    }),
    db.cardIssuance.findUnique({
      where: { applicationId: id },
      include: { registration: { select: { registrationNumber: true } } },
    }),
  ])

  const backHref = QUEUE_ROUTES[session.role] ?? '/dashboard'

  return (
    <Shell locale={loc} session={session}>
      <CaseHeader application={application} locale={loc} backHref={backHref} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start">
        <div className="min-w-0 space-y-6">
          {/* Step 1 — the clerk's two acts, in order. */}
          {session.role === 'REGISTRY_CLERK' && application.status === 'SUBMITTED' ? (
            <IntakeForm applicationId={id} />
          ) : null}

          {session.role === 'REGISTRY_CLERK' && application.status === 'UNDER_INTAKE' ? (
            <AssignExaminerForm
              applicationId={id}
              examiners={examiners.map((examiner) => ({
                id: examiner.id,
                name: personName(examiner, loc).primary,
              }))}
            />
          ) : null}

          {/* Steps 7 and 8 — after the card has been delivered. */}
          {session.role === 'DATA_MANAGER' && application.status === 'ACTIVE' ? (
            <DataExtractionForm applicationId={id} />
          ) : null}

          {session.role === 'FILES_HEAD' && application.status === 'ACTIVE' ? (
            <ArchiveForm applicationId={id} intakePageCount={application.pageCount} />
          ) : null}

          {issuance ? (
            <Panel title={t('issuedCard')}>
              <KeyValue columns={2}>
                <KeyValueItem label={t('registrationNumber')}>
                  <Ltr className="font-semibold text-navy-700">
                    {issuance.registration.registrationNumber}
                  </Ltr>
                </KeyValueItem>
                {issuance.deliverySerial ? (
                  <KeyValueItem label={t('deliverySerial')}>
                    <Ltr>{issuance.deliverySerial}</Ltr>
                  </KeyValueItem>
                ) : null}
              </KeyValue>
            </Panel>
          ) : null}

          {fileHandling ? (
            <Panel title={t('recordsTitle')}>
              <KeyValue columns={2}>
                {fileHandling.dataExtractedAt ? (
                  <KeyValueItem label={t('recordDataExtraction')}>
                    <Stamp value={fileHandling.dataExtractedAt} withTime />
                    {fileHandling.dataExtractedBy ? (
                      <span className="mt-0.5 block text-xs text-ink-faint">
                        {personName(fileHandling.dataExtractedBy, loc).primary}
                      </span>
                    ) : null}
                  </KeyValueItem>
                ) : null}
                {fileHandling.filedAt ? (
                  <KeyValueItem label={t('recordArchive')}>
                    <Stamp value={fileHandling.filedAt} withTime />
                    {fileHandling.archivedByUser ? (
                      <span className="mt-0.5 block text-xs text-ink-faint">
                        {personName(fileHandling.archivedByUser, loc).primary}
                      </span>
                    ) : null}
                  </KeyValueItem>
                ) : null}
                {fileHandling.serialRegisterNo ? (
                  <KeyValueItem label={t('serialRegisterNo')}>
                    <Ltr>{fileHandling.serialRegisterNo}</Ltr>
                  </KeyValueItem>
                ) : null}
                {fileHandling.alphabeticalIndex ? (
                  <KeyValueItem label={t('alphabeticalIndex')}>
                    {fileHandling.alphabeticalIndex}
                  </KeyValueItem>
                ) : null}
                {fileHandling.pageCount !== null ? (
                  <KeyValueItem label={t('pageCount')}>
                    <Ltr>{fileHandling.pageCount}</Ltr>
                  </KeyValueItem>
                ) : null}
              </KeyValue>

              {/* The discrepancy the archive step exists to catch. Stated, not
                  hidden — a page count that changed between the counter and the
                  shelf is the whole reason both are recorded. */}
              {fileHandling.pageCount !== null &&
              application.pageCount !== null &&
              fileHandling.pageCount !== application.pageCount ? (
                <Notice tone="caution" className="mt-4">
                  {t('pageCountMismatch', { intake: application.pageCount })}
                </Notice>
              ) : null}
            </Panel>
          ) : null}

          <CaseSummary application={application} locale={loc} />
        </div>

        <EventTrail applicationId={id} locale={loc} />
      </div>
    </Shell>
  )
}
