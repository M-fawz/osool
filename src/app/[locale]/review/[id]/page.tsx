import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { guard } from '@/lib/auth/guard'
import { AccessRefused } from '@/components/layout/access-refused'
import { Shell } from '@/components/layout/shell'
import { db } from '@/lib/db'
import { auditedRead } from '@/lib/auth/session'
import { loadApplicationDetail } from '@/lib/applications/completeness'
import { segregationOfDuties } from '@/lib/applications/refusals'
import { attachDocuments, resolveDocumentChecklist } from '@/lib/rules/documents'
import { personName } from '@/lib/auth/roles'
import type { Locale } from '@/i18n/routing'
import { KeyValue, KeyValueItem, Panel } from '@/components/ui/panel'
import { BlockedAction } from '@/components/ui/notice'
import { Status } from '@/components/ui/status'
import { Stamp } from '@/components/ui/bidi'
import { CaseHeader } from '@/components/gov/case-header'
import { CaseSummary } from '@/components/gov/case-summary'
import { EventTrail } from '@/components/gov/event-trail'
import { DecisionForm } from '@/components/gov/decision-form'

/**
 * The reviewer's screen. REQ-REG-050 step 3, REQ-REG-052.
 *
 * What the reviewer needs is not the whole file again — the examiner has just
 * been through it — but the examiner's conclusion, the evidence for it, and the
 * two buttons. So the examiner's form leads, the documents follow, and the
 * decision sits at the bottom where it is reached after reading rather than
 * before.
 *
 * If the reviewer examined this file themselves, the decision is replaced by
 * the four-part refusal. The Server Action refuses it too, and so does the
 * database — this is the third of three, and it is here so the officer learns
 * *why* rather than discovering it by pressing a button.
 */
export default async function ReviewCasePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { locale, id } = await params
  setRequestLocale(locale)

  const gate = await guard(['REVIEWER'], { caseData: true })
  if (!gate.ok) return <AccessRefused result={gate} locale={locale as Locale} />

  const session = gate.session
  const loc = locale as Locale

  const application = await auditedRead(
    session,
    { entityType: 'Application', entityId: id, action: 'APPLICATION_VIEWED_FOR_REVIEW' },
    () => loadApplicationDetail(id),
  )

  if (!application) notFound()

  const [t, tBlocked] = await Promise.all([
    getTranslations('gov'),
    getTranslations('blocked'),
  ])

  const asOf = application.submittedAt ?? new Date()

  const [examination, checklist, completions] = await Promise.all([
    db.examinationRecord.findUnique({
      where: { applicationId: id },
      include: {
        examiner: { select: { name: true, nameAr: true } },
        fieldChecks: true,
      },
    }),
    resolveDocumentChecklist(
      {
        establishmentType: application.entityData?.establishmentType ?? 'NATURAL_PERSON',
        capacity: application.applicantCapacity,
      },
      { asOf },
    ),
    db.completion.findMany({
      where: { applicationId: id, archivedAt: null },
      orderBy: { itemNumber: 'asc' },
    }),
  ])

  const documents = attachDocuments(checklist, application.documents)
  const requiredMissing = documents.filter((item) => item.required && !item.document)

  // REQ-REG-052 — the reviewer must not be the examiner of this application.
  const blockedBySod = application.examinerId === session.userId
  const violation = blockedBySod ? segregationOfDuties({ role: session.role }) : null

  const examinerName = examination
    ? personName(
        { name: examination.examiner.name, nameAr: examination.examiner.nameAr },
        loc,
      ).primary
    : null

  const verifiedCount = (examination?.fieldChecks ?? []).filter((c) => c.verified).length
  const totalChecks = examination?.fieldChecks.length ?? 0

  return (
    <Shell locale={loc} session={session}>
      <CaseHeader application={application} locale={loc} backHref="/review" />

      {violation ? (
        <BlockedAction
          className="mb-6"
          what={violation[loc].blocked}
          why={violation[loc].why}
          nextStep={violation[loc].nextStep}
          whoToAsk={violation[loc].whoToAsk}
          legalSource={violation.legalSource}
          headings={{
            what: tBlocked('whatHeading'),
            why: tBlocked('whyHeading'),
            next: tBlocked('nextHeading'),
            who: tBlocked('whoHeading'),
          }}
        />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start">
        <div className="min-w-0 space-y-6">
          <Panel title={t('reviewExaminerSaid')}>
            {examination ? (
              <KeyValue columns={2}>
                <KeyValueItem label={t('colExaminer')}>{examinerName}</KeyValueItem>
                <KeyValueItem label={t('recommendation')}>
                  {examination.recommendation === 'RECOMMEND_APPROVAL' ? (
                    <Status tone="confirmed">{t('recommendApproval')}</Status>
                  ) : examination.recommendation === 'RECOMMEND_REFUSAL' ? (
                    <Status tone="blocking">{t('recommendRefusal')}</Status>
                  ) : (
                    '—'
                  )}
                </KeyValueItem>
                <KeyValueItem label={t('verifyField')}>
                  <span className="ltr-run">
                    {verifiedCount}/{totalChecks}
                  </span>
                </KeyValueItem>
                <KeyValueItem label={t('proposedValidFrom')}>
                  {examination.proposedValidFrom ? (
                    <>
                      <Stamp value={examination.proposedValidFrom} /> —{' '}
                      {examination.proposedValidTo ? (
                        <Stamp value={examination.proposedValidTo} />
                      ) : (
                        '—'
                      )}
                    </>
                  ) : (
                    '—'
                  )}
                </KeyValueItem>
                <KeyValueItem label={t('originalCount')}>
                  <span className="ltr-run">
                    {examination.originalCount} / {examination.copyCount}
                  </span>
                </KeyValueItem>
                {examination.signedAt ? (
                  <KeyValueItem label={t('sendToReview')}>
                    <Stamp value={examination.signedAt} withTime />
                  </KeyValueItem>
                ) : null}
                {examination.examinerNote ? (
                  <KeyValueItem label={t('examinerNote')} className="sm:col-span-2">
                    {examination.examinerNote}
                  </KeyValueItem>
                ) : null}
              </KeyValue>
            ) : (
              <p className="text-sm text-blocking">—</p>
            )}
          </Panel>

          {/* The one fact a reviewer must not have to go looking for. An
              approval granted while a required document was absent is
              00-VISION §5's fifteenth signal, and the screen should make it
              impossible to do by accident. */}
          {requiredMissing.length > 0 ? (
            <Panel title={t('checklistTitle')}>
              <ul className="space-y-2">
                {requiredMissing.map((item) => (
                  <li key={item.key} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 flex-1 text-sm text-ink">
                      {loc === 'ar' ? item.payload.labelAr : item.payload.labelEn}
                    </span>
                    <Status tone="caution" size="sm">
                      {t('completionsOutstanding')}
                    </Status>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          {completions.length > 0 ? (
            <Panel title={t('completionsTitle')}>
              <ol className="divide-y divide-rule">
                {completions.map((completion) => (
                  <li key={completion.id} className="flex items-start gap-3 py-2 first:pt-0 last:pb-0">
                    <span className="ltr-run mt-0.5 shrink-0 text-sm font-semibold text-ink-faint">
                      {completion.itemNumber}.
                    </span>
                    <span className="min-w-0 flex-1 text-sm text-ink">
                      {loc === 'ar'
                        ? completion.descriptionAr
                        : (completion.descriptionEn ?? completion.descriptionAr)}
                      {!completion.checklistItemKey ? (
                        <span className="mt-0.5 block text-2xs text-caution">
                          {t('completionChecklistNone')}
                        </span>
                      ) : null}
                    </span>
                    <Status
                      tone={completion.status === 'SATISFIED' ? 'confirmed' : 'caution'}
                      size="sm"
                    >
                      {completion.status === 'SATISFIED'
                        ? t('completionsSatisfied')
                        : t('completionsOutstanding')}
                    </Status>
                  </li>
                ))}
              </ol>
            </Panel>
          ) : null}

          <CaseSummary application={application} locale={loc} />
        </div>

        <div className="space-y-6">
          {!blockedBySod && application.status === 'UNDER_REVIEW' ? (
            <DecisionForm applicationId={id} />
          ) : null}
          <EventTrail applicationId={id} locale={loc} />
        </div>
      </div>
    </Shell>
  )
}
