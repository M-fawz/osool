'use client'

import { useLocale, useTranslations } from 'next-intl'
import type { Governorate, PartyType } from '@prisma/client'
import { saveEntityAction } from '@/app/[locale]/application/actions'
import { establishmentTypeLabels } from '@/lib/reference/capacities'
import { GOVERNORATE_ORDER, governorateLabels } from '@/lib/reference/governorates'
import { Field, Input, Select } from '@/components/ui/form'
import { ChoiceGroup, ChoiceOption } from './choice'
import { ActionForm } from '@/components/forms/action-form'
import { WhyWeAsk } from './why-we-ask'

/**
 * Step 3 — the firm. REQ-REG-030.
 *
 * The longest screen in the flow, and the only place the "one decision per
 * screen" rule bends. It bends deliberately: these fields are all copied off
 * two documents the applicant is holding — the commercial register extract and
 * the tax card — and splitting them across four screens would make somebody put
 * the same piece of paper down and pick it up four times. The screen is
 * grouped by *which document you are looking at*, which is the order the work
 * actually happens in.
 */
export function EntityForm({
  applicationId,
  defaults,
}: {
  applicationId: string
  defaults: {
    establishmentType: PartyType | null
    legalForm: string | null
    tradeNameAr: string | null
    tradeNameEn: string | null
    tradeStyleAr: string | null
    tradeStyleEn: string | null
    headOfficeAddress: string | null
    governorate: Governorate | null
    poBox: string | null
    telephone: string | null
    email: string | null
    commercialRegisterNo: string | null
    commercialRegisterOffice: string | null
    commercialRegisterDate: string | null
    commercialRegisterRenewalDate: string | null
    taxRegistrationNo: string | null
    taxOffice: string | null
  }
}) {
  const t = useTranslations('apply')
  const tCommon = useTranslations('common')
  const locale = useLocale() as 'ar' | 'en'

  return (
    <ActionForm
      action={saveEntityAction}
      applicationId={applicationId}
      submitLabel={t('saveAndContinue')}
      onSavedGoTo="/application"
    >
      <ChoiceGroup
        legend={t('establishmentType')}
        errorFor="establishmentType"
      >
        {(['NATURAL_PERSON', 'LEGAL_PERSON'] as const).map((type) => (
          <ChoiceOption
            key={type}
            name="establishmentType"
            value={type}
            label={locale === 'ar' ? establishmentTypeLabels[type].ar : establishmentTypeLabels[type].en}
            help={locale === 'ar' ? establishmentTypeLabels[type].helpAr : establishmentTypeLabels[type].helpEn}
            defaultChecked={(defaults.establishmentType ?? 'NATURAL_PERSON') === type}
          />
        ))}
      </ChoiceGroup>

      <section className="space-y-4">
        <h2 className="text-md font-semibold text-navy-700">{t('entityNamesHeading')}</h2>

        <Field label={t('tradeNameAr')} htmlFor="tradeNameAr" required errorFor="tradeNameAr">
          <Input name="tradeNameAr" defaultValue={defaults.tradeNameAr ?? ''} lang="ar" dir="rtl" />
        </Field>
        <WhyWeAsk label={t('whyWeAsk')}>{t('whyTradeName')}</WhyWeAsk>

        <Field
          label={t('tradeNameEn')}
          hint={tCommon('optional')}
          htmlFor="tradeNameEn"
          errorFor="tradeNameEn"
        >
          <Input name="tradeNameEn" defaultValue={defaults.tradeNameEn ?? ''} lang="en" dir="ltr" />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t('tradeStyleAr')}
            hint={tCommon('optional')}
            htmlFor="tradeStyleAr"
            errorFor="tradeStyleAr"
          >
            <Input name="tradeStyleAr" defaultValue={defaults.tradeStyleAr ?? ''} lang="ar" dir="rtl" />
          </Field>
          <Field
            label={t('tradeStyleEn')}
            hint={tCommon('optional')}
            htmlFor="tradeStyleEn"
            errorFor="tradeStyleEn"
          >
            <Input name="tradeStyleEn" defaultValue={defaults.tradeStyleEn ?? ''} lang="en" dir="ltr" />
          </Field>
        </div>
        <WhyWeAsk label={t('whyWeAsk')}>{t('whyTradeStyle')}</WhyWeAsk>

        <Field
          label={t('legalForm')}
          hint={tCommon('optional')}
          htmlFor="legalForm"
          errorFor="legalForm"
        >
          <Input name="legalForm" defaultValue={defaults.legalForm ?? ''} />
        </Field>
      </section>

      <section className="space-y-4 border-t border-rule pt-6">
        <h2 className="text-md font-semibold text-navy-700">{t('entityAddressHeading')}</h2>

        <Field
          label={t('headOfficeAddress')}
          htmlFor="headOfficeAddress"
          required
          errorFor="headOfficeAddress"
        >
          <Input name="headOfficeAddress" defaultValue={defaults.headOfficeAddress ?? ''} autoComplete="street-address" />
        </Field>

        <Field label={t('governorate')} htmlFor="governorate" required errorFor="governorate">
          <Select name="governorate" defaultValue={defaults.governorate ?? ''}>
            <option value="" disabled>
              —
            </option>
            {GOVERNORATE_ORDER.map((g) => (
              <option key={g} value={g}>
                {governorateLabels[g][locale]}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('telephone')} htmlFor="telephone" required errorFor="telephone">
            <Input name="telephone" type="tel" inputMode="tel" defaultValue={defaults.telephone ?? ''} dir="ltr" autoComplete="tel" />
          </Field>
          <Field
            label={t('poBox')}
            hint={tCommon('optional')}
            htmlFor="poBox"
            errorFor="poBox"
          >
            <Input name="poBox" defaultValue={defaults.poBox ?? ''} dir="ltr" />
          </Field>
        </div>

        <Field
          label={t('email')}
          hint={tCommon('optional')}
          htmlFor="email"
          errorFor="email"
        >
          <Input name="email" type="email" defaultValue={defaults.email ?? ''} dir="ltr" autoComplete="email" />
        </Field>
      </section>

      <section className="space-y-4 border-t border-rule pt-6">
        <h2 className="text-md font-semibold text-navy-700">{t('entityRegisterHeading')}</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t('commercialRegisterNo')}
            htmlFor="commercialRegisterNo"
            hint={t('digitsOnlyHint')}
            required
            errorFor="commercialRegisterNo"
          >
            <Input
              name="commercialRegisterNo"
              defaultValue={defaults.commercialRegisterNo ?? ''}
              inputMode="numeric"
              dir="ltr"
              className="font-mono"
            />
          </Field>
          <Field
            label={t('commercialRegisterOffice')}
            htmlFor="commercialRegisterOffice"
            required
            errorFor="commercialRegisterOffice"
          >
            <Input name="commercialRegisterOffice" defaultValue={defaults.commercialRegisterOffice ?? ''} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t('commercialRegisterDate')}
            htmlFor="commercialRegisterDate"
            required
            errorFor="commercialRegisterDate"
          >
            <Input
              name="commercialRegisterDate"
              type="date"
              defaultValue={defaults.commercialRegisterDate ?? ''}
              dir="ltr"
            />
          </Field>
          <Field
            label={t('commercialRegisterRenewalDate')}
            hint={tCommon('optional')}
            htmlFor="commercialRegisterRenewalDate"
            errorFor="commercialRegisterRenewalDate"
          >
            <Input
              name="commercialRegisterRenewalDate"
              type="date"
              defaultValue={defaults.commercialRegisterRenewalDate ?? ''}
              dir="ltr"
            />
          </Field>
        </div>
        <WhyWeAsk label={t('whyWeAsk')}>{t('whyCommercialRegister')}</WhyWeAsk>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t('taxRegistrationNo')}
            htmlFor="taxRegistrationNo"
            hint={t('digitsOnlyHint')}
            required
            errorFor="taxRegistrationNo"
          >
            <Input
              name="taxRegistrationNo"
              defaultValue={defaults.taxRegistrationNo ?? ''}
              inputMode="numeric"
              dir="ltr"
              className="font-mono"
            />
          </Field>
          <Field label={t('taxOffice')} htmlFor="taxOffice" required errorFor="taxOffice">
            <Input name="taxOffice" defaultValue={defaults.taxOffice ?? ''} />
          </Field>
        </div>
        <WhyWeAsk label={t('whyWeAsk')}>{t('whyTax')}</WhyWeAsk>
      </section>
    </ActionForm>
  )
}
