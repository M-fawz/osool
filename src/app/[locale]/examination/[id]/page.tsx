import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { BrokerType } from '@prisma/client'
import { guard } from '@/lib/auth/guard'
import { AccessRefused } from '@/components/layout/access-refused'
import { Shell } from '@/components/layout/shell'
import { db } from '@/lib/db'
import { auditedRead } from '@/lib/auth/session'
import { loadApplicationDetail } from '@/lib/applications/completeness'
import { ruleSet } from '@/lib/rules'
import { attachDocuments, resolveDocumentChecklist } from '@/lib/rules/documents'
import { governorateLabels } from '@/lib/reference/governorates'
import { capacityLabels, establishmentTypeLabels } from '@/lib/reference/capacities'
import { formatEgp } from '@/lib/rules/violation'
import type { Locale } from '@/i18n/routing'
import { Notice } from '@/components/ui/notice'
import { CaseHeader } from '@/components/gov/case-header'
import { CaseSummary } from '@/components/gov/case-summary'
import { EventTrail } from '@/components/gov/event-trail'
import { ExaminationScreen, type ReviewLine } from '@/components/gov/examination-screen'

/**
 * The examiner's case screen.
 *
 * All of the work of this page is turning REQ-REG-051's sixteen lines into
 * rows that each hold three things: the declared fact, the document that
 * answers it, and the tick. The mapping from a form line to the declared value
 * lives here — on the server, next to the data — rather than in the client
 * component, so the browser never receives more of the file than it draws.
 *
 * The read is audited. REQ-DPA-002: who *viewed* an application is recorded,
 * not only who changed it, and an examiner opening a file they were not
 * assigned is exactly the pattern 00-VISION §5's process-integrity signals are
 * computed from.
 */
export default async function ExaminationCasePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { locale, id } = await params
  setRequestLocale(locale)

  const gate = await guard(['EXAMINER'], { caseData: true })
  if (!gate.ok) return <AccessRefused result={gate} locale={locale as Locale} />

  const session = gate.session
  const loc = locale as Locale

  const application = await auditedRead(
    session,
    { entityType: 'Application', entityId: id, action: 'APPLICATION_VIEWED_FOR_EXAMINATION' },
    () => loadApplicationDetail(id),
  )

  if (!application) notFound()

  const t = await getTranslations('gov')
  const asOf = application.submittedAt ?? new Date()

  const [form, checklist, types, examination, outstanding] = await Promise.all([
    ruleSet<{ labelAr: string; labelEn: string; evidenceFrom: string | null }>('EXAMINATION_FORM', {
      asOf,
    }),
    resolveDocumentChecklist(
      {
        establishmentType: application.entityData?.establishmentType ?? 'NATURAL_PERSON',
        capacity: application.applicantCapacity,
      },
      { asOf },
    ),
    ruleSet<{ labelAr: string; labelEn: string }>('BROKER_TYPE', { asOf }),
    db.examinationRecord.findUnique({
      where: { applicationId: id },
      include: { fieldChecks: true },
    }),
    db.completion.findMany({
      where: { applicationId: id, status: 'REQUESTED', archivedAt: null },
      orderBy: { itemNumber: 'asc' },
    }),
  ])

  const documents = attachDocuments(checklist, application.documents)
  const documentByKey = new Map(documents.map((item) => [item.key, item]))
  const verified = new Set(
    (examination?.fieldChecks ?? []).filter((check) => check.verified).map((check) => check.fieldKey),
  )

  const entity = application.entityData
  const label = loc === 'ar' ? ('labelAr' as const) : ('labelEn' as const)

  /** The declared value for each REQ-REG-051 line, formatted for reading. */
  const declaredFor = (key: string): string | null => {
    switch (key) {
      case 'TRADE_NAME':
        return entity ? [entity.tradeNameAr, entity.tradeNameEn].filter(Boolean).join(' · ') : null
      case 'TRADE_STYLE':
        return entity ? ([entity.tradeStyleAr, entity.tradeStyleEn].filter(Boolean).join(' · ') || null) : null
      case 'ESTABLISHMENT_TYPE':
        return entity
          ? [establishmentTypeLabels[entity.establishmentType][loc], entity.legalForm]
              .filter(Boolean)
              .join(' · ')
          : null
      case 'CAPITAL':
        return application.paidUpCapital === null
          ? null
          : formatEgp(Number(application.paidUpCapital), loc)
      case 'ACTIVITY_ADDRESS':
        return entity?.headOfficeAddress ?? null
      case 'GOVERNORATE':
        return entity ? governorateLabels[entity.governorate][loc] : null
      case 'ACTIVITY':
        return application.requestedTypes
          .map((type) => types.byKey.get(type)?.payload[label] ?? type)
          .join(' · ')
      case 'COMMERCIAL_REGISTER':
        return entity ? `${entity.commercialRegisterNo} — ${entity.commercialRegisterOffice}` : null
      case 'TAX_REGISTRATION':
        return entity ? `${entity.taxRegistrationNo} — ${entity.taxOffice}` : null
      case 'TELEPHONE':
        return entity?.telephone ?? null
      case 'APPLICANT_IDENTITY':
        return application.applicantParty
          ? [
              application.applicantParty.nameAr,
              application.applicantCapacity
                ? capacityLabels[application.applicantCapacity][loc]
                : null,
            ]
              .filter(Boolean)
              .join(' — ')
          : null
      case 'POWER_OF_ATTORNEY':
        return application.powerOfAttorney
          ? `${application.powerOfAttorney.number} / ${application.powerOfAttorney.year} — ${application.powerOfAttorney.notarisationOffice}`
          : null
      case 'CLIENT_DATA':
        return application.contractData.length === 0
          ? null
          : application.contractData
              .map((contract) => `${contract.clientNameAr} (${contract.clientNationality})`)
              .join(' · ')
      case 'BROKERAGE_NATURE':
        return application.contractData.length === 0
          ? null
          : [
              ...new Set(
                application.contractData.map(
                  (contract) => types.byKey.get(contract.capacityActedIn)?.payload[label] ?? contract.capacityActedIn,
                ),
              ),
            ].join(' · ')
      case 'CRIMINAL_RECORD':
        return documentByKey.get('CRIMINAL_RECORD_EXTRACT')?.document ? '✓' : null
      case 'COPIES_COUNT':
        return examination ? `${examination.originalCount} / ${examination.copyCount}` : null
      default:
        return null
    }
  }

  const lines: ReviewLine[] = form.items
    // The power-of-attorney line applies only where an agent is acting; showing
    // it otherwise is a line an examiner can never tick and would eventually
    // learn to ignore.
    .filter(
      (item) =>
        item.key !== 'POWER_OF_ATTORNEY' || application.applicantCapacity === 'AGENT_UNDER_POA',
    )
    .map((item) => {
      const evidenceKey = item.payload.evidenceFrom
      const evidence = evidenceKey ? documentByKey.get(evidenceKey) : undefined

      return {
        fieldKey: item.key,
        label: item.payload[label],
        declared: declaredFor(item.key),
        evidenceDocumentId: evidence?.document?.id ?? null,
        evidenceLabel: evidence ? evidence.payload[label] : null,
        evidenceMimeType: evidence?.document?.mimeType ?? null,
        evidenceMissing: Boolean(evidence?.required && !evidence.document),
        verified: verified.has(item.key),
      }
    })

  const today = new Date().toISOString().slice(0, 10)

  return (
    <Shell locale={loc} session={session}>
      <CaseHeader application={application} locale={loc} backHref="/examination" />

      {application.examinerId !== session.userId ? (
        <Notice tone="caution" className="mb-6" title={t('examinationTitle')}>
          {t('sodNoticeLead')}
        </Notice>
      ) : null}

      <ExaminationScreen
        applicationId={id}
        lines={lines}
        types={types.items.map((item) => ({
          key: item.key as BrokerType,
          label: item.payload[label],
        }))}
        completionChoices={checklist.items.map((item) => ({
          key: item.key,
          label: item.payload[loc === 'ar' ? 'labelAr' : 'labelEn'],
        }))}
        outstanding={outstanding.map((item) => ({
          itemNumber: item.itemNumber,
          descriptionAr: item.descriptionAr,
          descriptionEn: item.descriptionEn,
          checklistItemKey: item.checklistItemKey,
          round: item.round,
        }))}
        defaults={{
          originalCount: examination?.originalCount ?? 1,
          copyCount: examination?.copyCount ?? 0,
          brokerageNature: examination?.brokerageNature ?? application.requestedTypes,
          proposedValidFrom: examination?.proposedValidFrom?.toISOString().slice(0, 10) ?? today,
          proposedValidTo: examination?.proposedValidTo?.toISOString().slice(0, 10) ?? '',
          recommendation: examination?.recommendation ?? null,
          examinerNote: examination?.examinerNote ?? null,
        }}
        canSign={application.examinerId === session.userId && application.status === 'UNDER_EXAMINATION'}
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
        <CaseSummary application={application} locale={loc} />
        <EventTrail applicationId={id} locale={loc} />
      </div>
    </Shell>
  )
}
