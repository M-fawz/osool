import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { BrokerCategory, BrokerType } from '@prisma/client'
import { guard } from '@/lib/auth/guard'
import { AccessRefused } from '@/components/layout/access-refused'
import { PortalShell } from '@/components/layout/portal-shell'
import { BROKER_ROLES } from '@/lib/auth/roles'
import { db } from '@/lib/db'
import { uploadRequestCeilingMb } from '@/lib/env'
import { evaluateCompleteness, loadApplicationDetail } from '@/lib/applications/completeness'
import { isApplicationStep, stepsFor, type ApplicationStep } from '@/lib/applications/steps'
import { ruleSet } from '@/lib/rules'
import { formatEgp } from '@/lib/rules/violation'
import { attachDocuments, resolveDocumentChecklist } from '@/lib/rules/documents'
import {
  declarationGroupLabels,
  resolveDeclarations,
  type DeclarationGroup,
} from '@/lib/rules/declarations'
import type { Locale } from '@/i18n/routing'
import { redirect } from '@/i18n/navigation'
import { PageHeader } from '@/components/ui/panel'
import { Notice } from '@/components/ui/notice'
import { StepProgress } from '@/components/application/step-progress'
import { CapacityForm } from '@/components/application/capacity-form'
import { PowerOfAttorneyForm } from '@/components/application/poa-form'
import { EntityForm } from '@/components/application/entity-form'
import { CategoryForm, type CategoryBand } from '@/components/application/category-form'
import { ContractsStep } from '@/components/application/contracts-step'
import { DocumentsStep } from '@/components/application/documents-step'
import { DeclarationsStep } from '@/components/application/declarations-step'
import { ReviewStep } from '@/components/application/review-step'

/**
 * One route for all eight steps.
 *
 * Everything common to a step happens once, here: the guard, the load, the
 * ownership check, the completeness evaluation, and the progress indicator. The
 * step components below receive plain serialisable data and know nothing about
 * sessions or the database — which is what keeps a rule from accidentally being
 * evaluated in the browser.
 *
 * An unknown slug is a 404 rather than a redirect to step 1, because silently
 * moving somebody who followed a stale bookmark hides the fact that the link
 * they were given is wrong.
 */

export default async function ApplicationStepPage({
  params,
}: {
  params: Promise<{ locale: string; id: string; step: string }>
}) {
  const { locale, id, step } = await params
  setRequestLocale(locale)

  if (!isApplicationStep(step)) notFound()

  const gate = await guard(BROKER_ROLES, { caseData: true })
  if (!gate.ok) return <AccessRefused result={gate} locale={locale as Locale} />

  const session = gate.session
  const loc = locale as Locale

  const application = await loadApplicationDetail(id)

  // Ownership is checked before existence is admitted: a broker probing ids
  // should not be able to tell a stranger's application from a missing one.
  if (
    !application ||
    !session.brokerEntityId ||
    application.brokerEntityId !== session.brokerEntityId
  ) {
    notFound()
  }

  const availableSteps = stepsFor(application.applicantCapacity)

  // The power-of-attorney step does not exist for a sole trader. Landing on it
  // sends them to the step that follows rather than showing a page that asks
  // for a document they do not have.
  if (!availableSteps.includes(step as ApplicationStep)) {
    redirect({ href: `/application/${id}/entity`, locale: loc })
  }

  const [t, tApply, completeness] = await Promise.all([
    getTranslations('portal'),
    getTranslations('apply'),
    evaluateCompleteness(application),
  ])

  const entity = await db.brokerEntity.findUnique({
    where: { id: application.brokerEntityId },
    select: { tradeNameAr: true, tradeNameEn: true },
  })

  const firmName = application.entityData?.tradeNameAr ?? entity?.tradeNameAr ?? null

  const stepLabels = Object.fromEntries(
    availableSteps.map((s) => [s, tApply(`stepLabel.${s}` as 'stepLabel.capacity')]),
  ) as Record<ApplicationStep, string>

  const readOnly = application.status !== 'DRAFT' && application.status !== 'AWAITING_COMPLETION'

  return (
    <PortalShell
      locale={loc}
      session={session}
      firmName={firmName}
      backHref="/application"
      backLabel={t('title')}
    >
      <StepProgress
        applicationId={id}
        current={step as ApplicationStep}
        steps={completeness.steps}
        stepLabels={stepLabels}
      />

      {/* The lead was written for every one of these steps and rendered on
          none of them, so each screen opened with a title and a form. It is the
          sentence that says what this step is *for*. */}
      <PageHeader
        title={stepTitle(step as ApplicationStep, tApply)}
        lead={stepLead(step as ApplicationStep, tApply)}
      />

      {readOnly && step !== 'review' ? (
        <Notice tone="informational" className="mb-6">
          {tApply('submittedLead')}
        </Notice>
      ) : null}

      {await renderStep({
        step: step as ApplicationStep,
        application,
        completeness,
        locale: loc,
        readOnly,
      })}
    </PortalShell>
  )
}

function stepTitle(step: ApplicationStep, t: Awaited<ReturnType<typeof getTranslations<'apply'>>>) {
  switch (step) {
    case 'capacity':
      return t('capacityTitle')
    case 'power-of-attorney':
      return t('poaTitle')
    case 'entity':
      return t('entityTitle')
    case 'category':
      return t('categoryTitle')
    case 'contracts':
      return t('contractsTitle')
    case 'documents':
      return t('documentsTitle')
    case 'declarations':
      return t('declarationsTitle')
    case 'review':
      return t('reviewTitle')
  }
}

function stepLead(step: ApplicationStep, t: Awaited<ReturnType<typeof getTranslations<'apply'>>>) {
  switch (step) {
    case 'capacity':
      return t('capacityLead')
    case 'power-of-attorney':
      return t('poaLead')
    case 'entity':
      return t('entityLead')
    case 'category':
      return t('categoryLead')
    case 'contracts':
      return t('contractsLead')
    case 'documents':
      return t('documentsLead')
    case 'declarations':
      return t('declarationsLead')
    case 'review':
      return t('reviewLead')
  }
}

/** `YYYY-MM-DD` for a date input, or ''. */
function dateValue(value: Date | null | undefined): string {
  return value ? value.toISOString().slice(0, 10) : ''
}

async function renderStep({
  step,
  application,
  completeness,
  locale,
  readOnly,
}: {
  step: ApplicationStep
  application: NonNullable<Awaited<ReturnType<typeof loadApplicationDetail>>>
  completeness: Awaited<ReturnType<typeof evaluateCompleteness>>
  locale: Locale
  readOnly: boolean
}) {
  const asOf = application.submittedAt ?? new Date()
  const id = application.id

  switch (step) {
    case 'capacity':
      return (
        <CapacityForm
          applicationId={id}
          defaults={{
            capacity: application.applicantCapacity,
            nameAr: application.applicantParty?.nameAr ?? null,
            nameEn: application.applicantParty?.nameEn ?? null,
            nationality: application.applicantParty?.nationality ?? null,
            hasNationalId: Boolean(application.applicantParty?.nationalIdHash),
          }}
        />
      )

    case 'power-of-attorney':
      return (
        <PowerOfAttorneyForm
          applicationId={id}
          defaults={{
            poaType: application.powerOfAttorney?.poaType ?? null,
            number: application.powerOfAttorney?.number ?? null,
            year: application.powerOfAttorney?.year ?? null,
            notarisationOffice: application.powerOfAttorney?.notarisationOffice ?? null,
            notarisedOn: dateValue(application.powerOfAttorney?.notarisedOn) || null,
          }}
        />
      )

    case 'entity': {
      const data = application.entityData
      return (
        <EntityForm
          applicationId={id}
          defaults={{
            establishmentType: data?.establishmentType ?? null,
            legalForm: data?.legalForm ?? null,
            tradeNameAr: data?.tradeNameAr ?? null,
            tradeNameEn: data?.tradeNameEn ?? null,
            tradeStyleAr: data?.tradeStyleAr ?? null,
            tradeStyleEn: data?.tradeStyleEn ?? null,
            headOfficeAddress: data?.headOfficeAddress ?? null,
            governorate: data?.governorate ?? null,
            poBox: data?.poBox ?? null,
            telephone: data?.telephone ?? null,
            email: data?.email ?? null,
            commercialRegisterNo: data?.commercialRegisterNo ?? null,
            commercialRegisterOffice: data?.commercialRegisterOffice ?? null,
            commercialRegisterDate: dateValue(data?.commercialRegisterDate) || null,
            commercialRegisterRenewalDate: dateValue(data?.commercialRegisterRenewalDate) || null,
            taxRegistrationNo: data?.taxRegistrationNo ?? null,
            taxOffice: data?.taxOffice ?? null,
          }}
        />
      )
    }

    case 'category': {
      // Every figure on this screen is read here, from the versioned rule set,
      // and formatted here — so the component that draws it holds no threshold
      // and no currency logic. REQ-REG-020.
      const [categories, types] = await Promise.all([
        ruleSet<{
          labelAr: string
          labelEn: string
          minimumPaidUpCapital: number
          contractValueCeiling: number | null
        }>('BROKER_CATEGORY', { asOf }),
        ruleSet<{ labelAr: string; labelEn: string; definitionEn: string }>('BROKER_TYPE', { asOf }),
      ])

      const bands: CategoryBand[] = categories.items.map((item) => ({
        key: item.key as BrokerCategory,
        label: locale === 'ar' ? item.payload.labelAr : item.payload.labelEn,
        minimumPaidUpCapital: item.payload.minimumPaidUpCapital,
        contractValueCeiling: item.payload.contractValueCeiling,
        minimumFormatted: formatEgp(item.payload.minimumPaidUpCapital, locale),
        ceilingFormatted:
          item.payload.contractValueCeiling === null
            ? null
            : formatEgp(item.payload.contractValueCeiling, locale),
      }))

      return (
        <CategoryForm
          applicationId={id}
          bands={bands}
          types={types.items.map((item) => ({
            key: item.key as BrokerType,
            label: locale === 'ar' ? item.payload.labelAr : item.payload.labelEn,
            // BROKER_TYPE carries an English definition only. Printing English
            // prose under an Arabic label on an Arabic-first screen is worse
            // than printing nothing: the label — سمسار بيع — already says what
            // the type is, and the sentence would read as an oversight.
            // Supplying `definitionAr` is a rule-set version bump, not a code
            // change; flagged in the Phase 1 report.
            definition: locale === 'en' ? item.payload.definitionEn : null,
          }))}
          defaults={{
            requestedTypes: application.requestedTypes,
            requestedCategory: application.requestedCategory,
            paidUpCapital:
              application.paidUpCapital === null ? null : Number(application.paidUpCapital),
          }}
          legalSource={categories.legalSource ?? 'Ministerial Decree 578 of 2025, Article 2'}
        />
      )
    }

    case 'contracts': {
      const types = await ruleSet<{ labelAr: string; labelEn: string }>('BROKER_TYPE', { asOf })
      return (
        <ContractsStep
          applicationId={id}
          continueHref={`/application/${id}/documents`}
          types={types.items.map((item) => ({
            key: item.key as BrokerType,
            label: locale === 'ar' ? item.payload.labelAr : item.payload.labelEn,
          }))}
          contracts={application.contractData.map((contract) => ({
            id: contract.id,
            position: contract.position,
            clientNameAr: contract.clientNameAr,
            clientNameEn: contract.clientNameEn,
            clientNationality: contract.clientNationality,
            authenticationBody: contract.authenticationBody,
            authenticationNumber: contract.authenticationNumber,
            validFrom: dateValue(contract.validFrom),
            validTo: dateValue(contract.validTo),
            capacityActedIn: contract.capacityActedIn,
            contractValue:
              contract.contractValue === null ? null : Number(contract.contractValue),
            subjectDescription: contract.subjectDescription,
            subjectAddress: contract.subjectAddress,
            governorate: contract.governorate,
          }))}
        />
      )
    }

    case 'documents': {
      const checklist = await resolveDocumentChecklist(
        {
          establishmentType: application.entityData?.establishmentType ?? 'NATURAL_PERSON',
          capacity: application.applicantCapacity,
        },
        { asOf },
      )
      const withDocuments = attachDocuments(checklist, application.documents)

      return (
        <DocumentsStep
          applicationId={id}
          continueHref={`/application/${id}/declarations`}
          // The host's request-body ceiling, not a rule. The per-item limits
          // below still come from DOC_CHECKLIST and are still enforced on the
          // server; this only lets the step say so before a phone spends two
          // minutes uploading something the platform will reject at the edge.
          requestCeilingMb={uploadRequestCeilingMb}
          items={withDocuments.map((item) => ({
            key: item.key,
            label: locale === 'ar' ? item.payload.labelAr : item.payload.labelEn,
            // The rule set carries an English description only. Rather than
            // print English prose on an Arabic screen, the Arabic reader gets
            // the label alone here — and, since this step was rewritten, the
            // four-part explanation under it, which is written in both
            // languages in the message catalogue. See `DocumentHelp`.
            description: locale === 'en' ? (item.payload.descriptionEn ?? null) : null,
            conditionNote: locale === 'en' ? (item.payload.conditionNote ?? null) : null,
            required: item.required,
            acceptedMimeTypes: item.payload.acceptedMimeTypes,
            maxSizeMb: item.payload.maxSizeMb,
            document: item.document
              ? {
                  id: item.document.id,
                  mimeType: item.document.mimeType,
                  sizeBytes: item.document.sizeBytes,
                  uploadedAt: item.document.uploadedAt.toISOString(),
                  version: item.document.version,
                }
              : null,
          }))}
        />
      )
    }

    case 'declarations': {
      const declarations = await resolveDeclarations({ asOf })
      const records = new Map(application.declarations.map((d) => [d.declarationKey, d]))

      const order: DeclarationGroup[] = (
        Object.keys(declarationGroupLabels) as DeclarationGroup[]
      ).sort((a, b) => declarationGroupLabels[a].order - declarationGroupLabels[b].order)

      const groups = order
        .map((group) => ({
          key: group,
          label: declarationGroupLabels[group][locale],
          items: declarations.items
            .filter((item) => item.group === group)
            .map((item) => {
              const record = records.get(item.key)
              return {
                key: item.key,
                position: item.position,
                group,
                // The wording asserted, in the reader's language.
                text: locale === 'ar' ? item.payload.textAr : item.payload.textEn,
                requiresQualificationWhenNegative:
                  item.payload.requiresQualificationWhenNegative === true,
                record: record
                  ? {
                      affirmed: record.affirmed,
                      qualification: record.qualification,
                      assertedAt: record.assertedAt.toISOString(),
                    }
                  : null,
              }
            }),
        }))
        .filter((group) => group.items.length > 0)

      return (
        <DeclarationsStep
          applicationId={id}
          groups={groups}
          total={declarations.items.length}
          continueHref={`/application/${id}/review`}
        />
      )
    }

    case 'review':
      return (
        <ReviewStep
          application={application}
          completeness={completeness}
          locale={locale}
          readOnly={readOnly}
        />
      )
  }
}
