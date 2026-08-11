'use client'

import { useLocale, useTranslations } from 'next-intl'
import type { ApplicantCapacity } from '@prisma/client'
import { saveCapacityAction } from '@/app/[locale]/application/actions'
import { CAPACITY_ORDER, capacityLabels } from '@/lib/reference/capacities'
import { Field, Input } from '@/components/ui/form'
import { ChoiceGroup, ChoiceOption } from './choice'
import { ActionForm } from '@/components/forms/action-form'
import { WhyWeAsk } from './why-we-ask'

/**
 * Step 1 — in what capacity are you applying?
 *
 * This is the screen that decides the shape of everything after it, so it is
 * the one screen in the flow with a second block on it: the applicant's own
 * identity. Splitting them would produce a screen with five radio buttons and
 * nothing else, and then a screen with three text fields and no context — two
 * taps where the applicant is answering one question, "who are you and on whose
 * behalf".
 */
export function CapacityForm({
  applicationId,
  defaults,
}: {
  applicationId: string
  defaults: {
    capacity: ApplicantCapacity | null
    nameAr: string | null
    nameEn: string | null
    nationality: string | null
    /** Whether an ID is already on file. The number itself is never sent here. */
    hasNationalId: boolean
  }
}) {
  const t = useTranslations('apply')
  const locale = useLocale() as 'ar' | 'en'

  return (
    <ActionForm
      action={saveCapacityAction}
      applicationId={applicationId}
      submitLabel={t('saveAndContinue')}
      onSavedGoTo="/application"
    >
      <CapacityChoice defaultValue={defaults.capacity} locale={locale} />

      <div className="space-y-4 border-t border-rule pt-6">
        <h2 className="text-md font-semibold text-navy-700">{t('applicantIdentityHeading')}</h2>

        <NameArField defaultValue={defaults.nameAr} />
        <NameEnField defaultValue={defaults.nameEn} />
        <NationalIdField hasExisting={defaults.hasNationalId} />
        <NationalityField defaultValue={defaults.nationality} />
      </div>
    </ActionForm>
  )
}

function CapacityChoice({
  defaultValue,
  locale,
}: {
  defaultValue: ApplicantCapacity | null
  locale: 'ar' | 'en'
}) {
  const t = useTranslations('apply')

  return (
    <div className="space-y-2">
      <ChoiceGroup legend={t('capacityTitle')} description={t('capacityLead')} errorFor="applicantCapacity">
        {CAPACITY_ORDER.map((capacity) => {
          const labels = capacityLabels[capacity]
          return (
            <ChoiceOption
              key={capacity}
              name="applicantCapacity"
              value={capacity}
              label={locale === 'ar' ? labels.ar : labels.en}
              help={locale === 'ar' ? labels.helpAr : labels.helpEn}
              defaultChecked={defaultValue === capacity}
            />
          )
        })}
      </ChoiceGroup>
      <WhyWeAsk label={t('whyWeAsk')}>{t('whyCapacity')}</WhyWeAsk>
    </div>
  )
}

function NameArField({ defaultValue }: { defaultValue: string | null }) {
  const t = useTranslations('apply')
  return (
    <Field
      label={t('applicantNameAr')}
      htmlFor="applicantNameAr"
      required
      errorFor="applicantNameAr"
    >
      <Input
        name="applicantNameAr"
        defaultValue={defaultValue ?? ''}
        autoComplete="name"
        lang="ar"
        dir="rtl"
      />
    </Field>
  )
}

function NameEnField({ defaultValue }: { defaultValue: string | null }) {
  const t = useTranslations('apply')
  const tCommon = useTranslations('common')
  return (
    <Field
      label={t('applicantNameEn')}
      hint={tCommon('optional')}
      htmlFor="applicantNameEn"
      errorFor="applicantNameEn"
    >
      {/* dir="ltr" on the control, not on the page. A Latin name typed into an
          RTL field puts the caret in the wrong place after every space. */}
      <Input name="applicantNameEn" defaultValue={defaultValue ?? ''} lang="en" dir="ltr" />
    </Field>
  )
}

function NationalIdField({ hasExisting }: { hasExisting: boolean }) {
  const t = useTranslations('apply')
  return (
    <div className="space-y-2">
      <Field
        label={t('applicantNationalId')}
        htmlFor="applicantNationalId"
        hint={hasExisting ? t('nationalIdOnFile') : undefined}
        required
        errorFor="applicantNationalId"
      >
        {/*
          Never pre-filled, even when one is on file. The number is encrypted at
          rest under REQ-DPA-002, and rendering it back into the page to save a
          re-type would put it in the HTML of every visit to this screen. The
          applicant re-enters it; that is the correct trade.

          inputMode="numeric" brings up the number pad on a phone. `dir="ltr"`
          because a fourteen-digit number typed into an RTL field reverses under
          the caret as it is entered.
        */}
        <Input
          name="applicantNationalId"
          inputMode="numeric"
          autoComplete="off"
          maxLength={20}
          dir="ltr"
          className="font-mono"
        />
      </Field>
      <WhyWeAsk label={t('whyWeAsk')}>{t('whyNationalId')}</WhyWeAsk>
    </div>
  )
}

function NationalityField({ defaultValue }: { defaultValue: string | null }) {
  const t = useTranslations('apply')
  return (
    <Field
      label={t('applicantNationality')}
      htmlFor="applicantNationality"
      errorFor="applicantNationality"
    >
      <Input name="applicantNationality" defaultValue={defaultValue ?? 'مصري'} />
    </Field>
  )
}
