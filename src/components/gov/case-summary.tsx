import { getTranslations } from 'next-intl/server'
import type { Locale } from '@/i18n/routing'
import type { ApplicationWithDetail } from '@/lib/applications/completeness'
import {
  authenticationBodyLabels,
  capacityLabels,
  establishmentTypeLabels,
} from '@/lib/reference/capacities'
import { governorateLabels } from '@/lib/reference/governorates'
import { ruleSet } from '@/lib/rules'
import { KeyValue, KeyValueItem, Panel } from '@/components/ui/panel'
import { Status } from '@/components/ui/status'
import { Ltr, Money, Stamp } from '@/components/ui/bidi'

/**
 * The application as submitted, for a government reader.
 *
 * The same facts the broker's review screen shows, drawn at back-office density
 * — 03-DESIGN-DIRECTION §8. No edit links, because nobody on this side of the
 * register edits an applicant's declaration: a correction is a completion
 * request, which is itemised and audited.
 */
export async function CaseSummary({
  application,
  locale,
}: {
  application: ApplicationWithDetail
  locale: Locale
}) {
  const t = await getTranslations('apply')
  const asOf = application.submittedAt ?? new Date()

  const [categories, types] = await Promise.all([
    ruleSet<{ labelAr: string; labelEn: string }>('BROKER_CATEGORY', { asOf }),
    ruleSet<{ labelAr: string; labelEn: string }>('BROKER_TYPE', { asOf }),
  ])

  const label = locale === 'ar' ? ('labelAr' as const) : ('labelEn' as const)
  const entity = application.entityData

  return (
    <div className="space-y-4">
      <Panel title={t('sectionEntity')}>
        {entity ? (
          <KeyValue columns={2}>
            <KeyValueItem label={t('tradeNameAr')}>
              <bdi>{entity.tradeNameAr}</bdi>
            </KeyValueItem>
            <KeyValueItem label={t('tradeNameEn')}>
              {entity.tradeNameEn ? <bdi dir="ltr">{entity.tradeNameEn}</bdi> : '—'}
            </KeyValueItem>
            <KeyValueItem label={t('tradeStyleAr')}>
              {entity.tradeStyleAr ? <bdi>{entity.tradeStyleAr}</bdi> : '—'}
            </KeyValueItem>
            <KeyValueItem label={t('establishmentType')}>
              {establishmentTypeLabels[entity.establishmentType][locale]}
              {entity.legalForm ? ` · ${entity.legalForm}` : ''}
            </KeyValueItem>
            <KeyValueItem label={t('headOfficeAddress')}>{entity.headOfficeAddress}</KeyValueItem>
            <KeyValueItem label={t('governorate')}>
              {governorateLabels[entity.governorate][locale]}
            </KeyValueItem>
            <KeyValueItem label={t('telephone')}>
              <Ltr>{entity.telephone}</Ltr>
              {entity.poBox ? (
                <>
                  {' · '}
                  <Ltr>{entity.poBox}</Ltr>
                </>
              ) : null}
            </KeyValueItem>
            <KeyValueItem label={t('email')}>
              {entity.email ? <Ltr>{entity.email}</Ltr> : '—'}
            </KeyValueItem>
            <KeyValueItem label={t('commercialRegisterNo')}>
              <Ltr>{entity.commercialRegisterNo}</Ltr> — {entity.commercialRegisterOffice}
            </KeyValueItem>
            <KeyValueItem label={t('commercialRegisterDate')}>
              <Stamp value={entity.commercialRegisterDate} />
              {entity.commercialRegisterRenewalDate ? (
                <>
                  {' · '}
                  <Stamp value={entity.commercialRegisterRenewalDate} />
                </>
              ) : null}
            </KeyValueItem>
            <KeyValueItem label={t('taxRegistrationNo')}>
              <Ltr>{entity.taxRegistrationNo}</Ltr> — {entity.taxOffice}
            </KeyValueItem>
          </KeyValue>
        ) : (
          <p className="text-sm text-blocking">—</p>
        )}
      </Panel>

      <Panel title={t('sectionApplicant')}>
        <KeyValue columns={2}>
          <KeyValueItem label={t('capacityTitle')}>
            {application.applicantCapacity
              ? capacityLabels[application.applicantCapacity][locale]
              : '—'}
          </KeyValueItem>
          <KeyValueItem label={t('applicantNameAr')}>
            {application.applicantParty?.nameAr ? (
              <bdi>{application.applicantParty.nameAr}</bdi>
            ) : (
              '—'
            )}
          </KeyValueItem>
          <KeyValueItem label={t('applicantNameEn')}>
            {application.applicantParty?.nameEn ? (
              <bdi dir="ltr">{application.applicantParty.nameEn}</bdi>
            ) : (
              '—'
            )}
          </KeyValueItem>
          <KeyValueItem label={t('applicantNationality')}>
            {application.applicantParty?.nationality ?? '—'}
          </KeyValueItem>
          {application.powerOfAttorney ? (
            <KeyValueItem label={t('sectionPoa')} className="sm:col-span-2">
              <Ltr>{application.powerOfAttorney.number}</Ltr>
              {' / '}
              <Ltr>{application.powerOfAttorney.year}</Ltr>
              {' — '}
              {application.powerOfAttorney.notarisationOffice}
            </KeyValueItem>
          ) : null}
        </KeyValue>
      </Panel>

      <Panel title={t('sectionCategory')}>
        <KeyValue columns={3}>
          <KeyValueItem label={t('categoryHeading')}>
            {application.requestedCategory
              ? (categories.byKey.get(application.requestedCategory)?.payload[label] ??
                application.requestedCategory)
              : '—'}
          </KeyValueItem>
          <KeyValueItem label={t('paidUpCapital')}>
            {application.paidUpCapital !== null ? (
              <Money amount={Number(application.paidUpCapital)} locale={locale} />
            ) : (
              '—'
            )}
          </KeyValueItem>
          <KeyValueItem label={t('typesHeading')}>
            <span className="flex flex-wrap gap-1.5">
              {application.requestedTypes.map((type) => (
                <Status key={type} tone="informational" size="sm">
                  {types.byKey.get(type)?.payload[label] ?? type}
                </Status>
              ))}
            </span>
          </KeyValueItem>
        </KeyValue>
      </Panel>

      <Panel title={t('sectionContracts')}>
        {application.contractData.length === 0 ? (
          <p className="text-sm text-blocking">—</p>
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
                  <span className="mx-1.5 text-ink-faint">·</span>
                  <span className="text-sm text-ink-muted">{contract.clientNationality}</span>
                </p>
                <p className="mt-1 text-sm text-ink-muted">
                  {authenticationBodyLabels[contract.authenticationBody][locale]}{' '}
                  <Ltr>{contract.authenticationNumber}</Ltr>
                  <span className="mx-1.5">·</span>
                  {types.byKey.get(contract.capacityActedIn)?.payload[label] ??
                    contract.capacityActedIn}
                  <span className="mx-1.5">·</span>
                  <Stamp value={contract.validFrom} /> — <Stamp value={contract.validTo} />
                  {contract.contractValue !== null ? (
                    <>
                      <span className="mx-1.5">·</span>
                      <Money amount={Number(contract.contractValue)} locale={locale} />
                    </>
                  ) : null}
                </p>
                <p className="mt-1 text-sm text-ink-muted">{contract.subjectDescription}</p>
                <p className="text-sm text-ink-faint">{contract.subjectAddress}</p>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      <Panel title={t('sectionDeclarations')}>
        <ol className="divide-y divide-rule">
          {application.declarations
            .slice()
            .sort((a, b) => a.declarationKey.localeCompare(b.declarationKey))
            .map((declaration) => (
              <li key={declaration.id} className="flex items-start gap-3 py-2 first:pt-0 last:pb-0">
                <span className="ltr-run shrink-0 text-xs font-semibold text-ink-faint">
                  {declaration.declarationKey.replace('DECL-', '')}
                </span>
                <span className="min-w-0 flex-1 text-sm text-ink">
                  {locale === 'ar' ? declaration.textAr : (declaration.textEn ?? declaration.textAr)}
                  {declaration.qualification ? (
                    <span className="mt-0.5 block text-xs text-caution">
                      {declaration.qualification}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-2xs text-ink-faint">
                  <Stamp value={declaration.assertedAt} withTime />
                </span>
              </li>
            ))}
        </ol>
      </Panel>
    </div>
  )
}
