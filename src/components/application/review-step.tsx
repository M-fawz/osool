import { getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { Link } from '@/i18n/navigation'
import type { Locale } from '@/i18n/routing'
import type { ApplicationWithDetail, Completeness } from '@/lib/applications/completeness'
import { statusLabels } from '@/lib/applications/refusals'
import { capacityLabels, authenticationBodyLabels } from '@/lib/reference/capacities'
import { governorateLabels } from '@/lib/reference/governorates'
import { roleLabel } from '@/lib/auth/roles'
import { ruleSet } from '@/lib/rules'
import { attachDocuments, resolveDocumentChecklist } from '@/lib/rules/documents'
import { KeyValue, KeyValueItem, Panel } from '@/components/ui/panel'
import { BlockedAction, Notice } from '@/components/ui/notice'
import { Status } from '@/components/ui/status'
import { Ltr, Money, Stamp } from '@/components/ui/bidi'
import { AlertTriangle, Check, Icon } from '@/components/ui/icon'
import { SubmitApplication } from './submit-application'

/**
 * Step 8 — review and submit.
 *
 * The requirement is precise: "the whole application summarised, every gap
 * flagged in red and reachable in one tap, and submission blocked until every
 * blocker is cleared". So the gaps come first, above the summary, as links —
 * not as a paragraph telling the applicant to go and look for them.
 *
 * The distinction the screen draws, and the reason it draws it: a **gap** is an
 * empty field, phrased as a task; a **violation** is a regulatory refusal,
 * rendered as the four-part notice with the decree named. Merging them would
 * make "upload your tax card" look like a legal finding, or make a capital
 * shortfall under Decree 578/2025 look like a forgotten field.
 */
export async function ReviewStep({
  application,
  completeness,
  locale,
  readOnly,
}: {
  application: ApplicationWithDetail
  completeness: Completeness
  locale: Locale
  readOnly: boolean
}) {
  const [t, tBlocked, tGov] = await Promise.all([
    getTranslations('apply'),
    getTranslations('blocked'),
    getTranslations('gov'),
  ])

  const asOf = application.submittedAt ?? new Date()
  const blocking = completeness.violations.filter((v) => v.severity === 'BLOCKING')
  const advisories = completeness.violations.filter((v) => v.severity !== 'BLOCKING')

  const [categories, checklist, events, openCompletions] = await Promise.all([
    ruleSet<{ labelAr: string; labelEn: string }>('BROKER_CATEGORY', { asOf }),
    resolveDocumentChecklist(
      {
        establishmentType: application.entityData?.establishmentType ?? 'NATURAL_PERSON',
        capacity: application.applicantCapacity,
      },
      { asOf },
    ),
    db.applicationEvent.findMany({
      where: { applicationId: application.id },
      orderBy: { occurredAt: 'asc' },
      include: { actor: { select: { name: true, nameAr: true } } },
    }),
    db.completion.findMany({
      where: { applicationId: application.id, status: 'REQUESTED', archivedAt: null },
      orderBy: { itemNumber: 'asc' },
    }),
  ])

  const types = await ruleSet<{ labelAr: string; labelEn: string }>('BROKER_TYPE', { asOf })
  const documents = attachDocuments(checklist, application.documents)
  const entity = application.entityData

  const categoryLabel = application.requestedCategory
    ? categories.byKey.get(application.requestedCategory)
    : undefined

  return (
    <div className="space-y-6">
      {/* Completions come first when there are any: they are the one thing on
          the screen that somebody is actively waiting for. */}
      {openCompletions.length > 0 ? (
        <Panel title={t('completionsTitle')} description={t('completionsLead')}>
          <ol className="space-y-3">
            {openCompletions.map((completion) => (
              <li key={completion.id} className="flex items-start gap-3">
                <span className="ltr-run mt-0.5 shrink-0 text-sm font-semibold text-caution">
                  {completion.itemNumber}.
                </span>
                <p className="min-w-0 flex-1 text-base text-ink">
                  {locale === 'ar'
                    ? completion.descriptionAr
                    : (completion.descriptionEn ?? completion.descriptionAr)}
                </p>
              </li>
            ))}
          </ol>
        </Panel>
      ) : null}

      {blocking.map((violation) => (
        <BlockedAction
          key={violation.code}
          what={violation[locale].blocked}
          why={violation[locale].why}
          nextStep={violation[locale].nextStep}
          whoToAsk={violation[locale].whoToAsk}
          legalSource={violation.legalSource}
          headings={{
            what: tBlocked('whatHeading'),
            why: tBlocked('whyHeading'),
            next: tBlocked('nextHeading'),
            who: tBlocked('whoHeading'),
          }}
        />
      ))}

      {advisories.map((violation) => (
        <Notice key={violation.code} tone="caution" title={violation[locale].blocked}>
          <p>{violation[locale].why}</p>
          <p className="mt-1">{violation[locale].nextStep}</p>
        </Notice>
      ))}

      {completeness.gaps.length > 0 ? (
        <section className="border border-blocking/30 bg-paper">
          <div className="flex items-start gap-2.5 border-b border-blocking/30 bg-blocking-soft px-4 py-3">
            <Icon as={AlertTriangle} size="md" className="mt-px text-blocking" />
            <div className="min-w-0">
              <p className="text-md font-semibold text-ink">{t('reviewGapsTitle')}</p>
              <p className="mt-0.5 text-sm text-ink-muted">{t('reviewGapsLead')}</p>
            </div>
          </div>
          <ul className="divide-y divide-rule">
            {completeness.gaps.map((gap) => (
              <li key={gap.key}>
                {/* One tap, straight to the step that fixes it. A list that
                    only names the problem makes the applicant hunt for it. */}
                <Link
                  href={`/application/${application.id}/${gap.step}`}
                  className="flex min-h-11 items-center gap-3 px-4 py-3 text-base text-ink hover:bg-navy-50"
                >
                  <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 bg-blocking" />
                  <span className="min-w-0 flex-1">{locale === 'ar' ? gap.ar : gap.en}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <Notice tone="confirmed" title={t('readyTitle')}>
          {t('readyLead')}
        </Notice>
      )}

      {/* ── The summary ──────────────────────────────────────────────────── */}

      <Section
        title={t('sectionApplicant')}
        editHref={`/application/${application.id}/capacity`}
        editLabel={t('reviewEdit')}
        readOnly={readOnly}
      >
        <KeyValue columns={2}>
          <KeyValueItem label={t('capacityTitle')}>
            {application.applicantCapacity
              ? capacityLabels[application.applicantCapacity][locale]
              : <Missing />}
          </KeyValueItem>
          <KeyValueItem label={t('applicantNameAr')}>
            {application.applicantParty?.nameAr ? (
              <bdi>{application.applicantParty.nameAr}</bdi>
            ) : (
              <Missing />
            )}
          </KeyValueItem>
          <KeyValueItem label={t('applicantNameEn')}>
            {application.applicantParty?.nameEn ? (
              <bdi dir="ltr">{application.applicantParty.nameEn}</bdi>
            ) : (
              <Missing />
            )}
          </KeyValueItem>
          <KeyValueItem label={t('applicantNationalId')}>
            {/* Never rendered. The number is encrypted at rest under
                REQ-DPA-002, and a review screen is not a reason to decrypt it
                back onto a page. That it is recorded is the fact that matters
                here. */}
            {application.applicantParty?.nationalIdHash ? (
              <span className="inline-flex items-center gap-1.5 text-ink-muted">
                <Icon as={Check} size="xs" className="text-confirmed" />
                {t('nationalIdRecorded')}
              </span>
            ) : (
              <Missing />
            )}
          </KeyValueItem>
        </KeyValue>
      </Section>

      {application.applicantCapacity === 'AGENT_UNDER_POA' ? (
        <Section
          title={t('sectionPoa')}
          editHref={`/application/${application.id}/power-of-attorney`}
          editLabel={t('reviewEdit')}
          readOnly={readOnly}
        >
          {application.powerOfAttorney ? (
            <KeyValue columns={2}>
              <KeyValueItem label={t('poaNumber')}>
                <Ltr>{application.powerOfAttorney.number}</Ltr>
              </KeyValueItem>
              <KeyValueItem label={t('poaYear')}>
                <Ltr>{application.powerOfAttorney.year}</Ltr>
              </KeyValueItem>
              <KeyValueItem label={t('poaOffice')}>
                {application.powerOfAttorney.notarisationOffice}
              </KeyValueItem>
              <KeyValueItem label={t('poaDeclareValid')}>
                {application.powerOfAttorney.stillValidDeclaredAt ? (
                  <Stamp value={application.powerOfAttorney.stillValidDeclaredAt} />
                ) : (
                  <Missing />
                )}
              </KeyValueItem>
            </KeyValue>
          ) : (
            <Missing />
          )}
        </Section>
      ) : null}

      <Section
        title={t('sectionEntity')}
        editHref={`/application/${application.id}/entity`}
        editLabel={t('reviewEdit')}
        readOnly={readOnly}
      >
        {entity ? (
          <KeyValue columns={2}>
            <KeyValueItem label={t('tradeNameAr')}>
              <bdi>{entity.tradeNameAr}</bdi>
            </KeyValueItem>
            <KeyValueItem label={t('tradeNameEn')}>
              {entity.tradeNameEn ? <bdi dir="ltr">{entity.tradeNameEn}</bdi> : <Missing />}
            </KeyValueItem>
            <KeyValueItem label={t('headOfficeAddress')}>{entity.headOfficeAddress}</KeyValueItem>
            <KeyValueItem label={t('governorate')}>
              {governorateLabels[entity.governorate][locale]}
            </KeyValueItem>
            <KeyValueItem label={t('telephone')}>
              <Ltr>{entity.telephone}</Ltr>
            </KeyValueItem>
            <KeyValueItem label={t('commercialRegisterNo')}>
              <Ltr>{entity.commercialRegisterNo}</Ltr> — {entity.commercialRegisterOffice}
            </KeyValueItem>
            <KeyValueItem label={t('commercialRegisterDate')}>
              <Stamp value={entity.commercialRegisterDate} />
            </KeyValueItem>
            <KeyValueItem label={t('taxRegistrationNo')}>
              <Ltr>{entity.taxRegistrationNo}</Ltr> — {entity.taxOffice}
            </KeyValueItem>
          </KeyValue>
        ) : (
          <Missing />
        )}
      </Section>

      <Section
        title={t('sectionCategory')}
        editHref={`/application/${application.id}/category`}
        editLabel={t('reviewEdit')}
        readOnly={readOnly}
      >
        <KeyValue columns={2}>
          <KeyValueItem label={t('typesHeading')}>
            {application.requestedTypes.length > 0 ? (
              <span className="flex flex-wrap gap-1.5">
                {application.requestedTypes.map((type) => (
                  <Status key={type} tone="informational" size="sm">
                    {types.byKey.get(type)?.payload[locale === 'ar' ? 'labelAr' : 'labelEn'] ?? type}
                  </Status>
                ))}
              </span>
            ) : (
              <Missing />
            )}
          </KeyValueItem>
          <KeyValueItem label={t('categoryHeading')}>
            {categoryLabel ? (
              categoryLabel.payload[locale === 'ar' ? 'labelAr' : 'labelEn']
            ) : (
              <Missing />
            )}
          </KeyValueItem>
          <KeyValueItem label={t('paidUpCapital')}>
            {application.paidUpCapital !== null ? (
              <Money amount={Number(application.paidUpCapital)} locale={locale} />
            ) : (
              <Missing />
            )}
          </KeyValueItem>
        </KeyValue>
      </Section>

      <Section
        title={t('sectionContracts')}
        editHref={`/application/${application.id}/contracts`}
        editLabel={t('reviewEdit')}
        readOnly={readOnly}
      >
        {application.contractData.length === 0 ? (
          <Missing />
        ) : (
          <ol className="divide-y divide-rule">
            {application.contractData.map((contract) => (
              <li key={contract.id} className="py-3 first:pt-0 last:pb-0">
                <p className="text-base font-medium text-ink">
                  <bdi>{contract.clientNameAr}</bdi>
                  <span className="mx-1.5 text-ink-faint">·</span>
                  <bdi dir="ltr" className="text-sm text-ink-muted">
                    {contract.clientNameEn}
                  </bdi>
                </p>
                <p className="mt-1 text-sm text-ink-muted">
                  {authenticationBodyLabels[contract.authenticationBody][locale]}{' '}
                  <Ltr>{contract.authenticationNumber}</Ltr>
                  <span className="mx-1.5">·</span>
                  <Stamp value={contract.validFrom} /> — <Stamp value={contract.validTo} />
                </p>
                <p className="mt-1 text-sm text-ink-muted">{contract.subjectDescription}</p>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section
        title={t('sectionDocuments')}
        editHref={`/application/${application.id}/documents`}
        editLabel={t('reviewEdit')}
        readOnly={readOnly}
      >
        <ul className="divide-y divide-rule">
          {documents
            .filter((item) => item.required || item.document)
            .map((item) => (
              <li key={item.key} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <span className="min-w-0 flex-1 text-base text-ink">
                  {locale === 'ar' ? item.payload.labelAr : item.payload.labelEn}
                </span>
                {item.document ? (
                  <Status tone="confirmed" size="sm">
                    {t('documentsSupplied')}
                  </Status>
                ) : (
                  <Status tone="caution" size="sm">
                    {t('documentsOutstanding')}
                  </Status>
                )}
              </li>
            ))}
        </ul>
      </Section>

      <Section
        title={t('sectionDeclarations')}
        editHref={`/application/${application.id}/declarations`}
        editLabel={t('reviewEdit')}
        readOnly={readOnly}
      >
        <p className="text-base text-ink">
          {t('declarationsProgress', {
            done: completeness.declarationsAffirmed,
            total: completeness.declarationsTotal,
          })}
        </p>
      </Section>

      {/* ── The trail ────────────────────────────────────────────────────── */}

      {events.length > 0 ? (
        <Panel title={t('timelineTitle')} description={t('timelineLead')}>
          <ol className="space-y-3">
            {events.map((event) => (
              <li key={event.id} className="flex gap-3">
                <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 bg-brass-500" />
                <div className="min-w-0">
                  <p className="text-base text-ink">
                    {statusLabels[event.toState][locale]}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-faint">
                    {tGov('eventBy', {
                      name:
                        (locale === 'ar' ? event.actor.nameAr : event.actor.name) ?? event.actor.name,
                      role: roleLabel(event.actorRole)[locale],
                    })}
                    <span className="mx-1.5">·</span>
                    <Stamp value={event.occurredAt} withTime />
                  </p>
                  {event.reason ? (
                    <p className="mt-1 text-sm text-ink-muted">{event.reason}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </Panel>
      ) : null}

      {!readOnly ? (
        <SubmitApplication
          applicationId={application.id}
          canSubmit={completeness.ok}
          isResubmission={application.status === 'AWAITING_COMPLETION'}
        />
      ) : null}
    </div>
  )
}

function Section({
  title,
  editHref,
  editLabel,
  readOnly,
  children,
}: {
  title: string
  editHref: string
  editLabel: string
  readOnly: boolean
  children: React.ReactNode
}) {
  return (
    <Panel
      title={title}
      actions={
        readOnly ? null : (
          <Link
            href={editHref}
            className="inline-flex min-h-11 items-center rounded-xs px-2 text-base font-medium text-navy-600 hover:underline"
          >
            {editLabel}
          </Link>
        )
      }
    >
      {children}
    </Panel>
  )
}

/** A field that has not been filled in. Never a dash — a dash reads as "none". */
function Missing() {
  return <span className="text-blocking">—</span>
}
