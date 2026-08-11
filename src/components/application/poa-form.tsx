'use client'

import { useLocale, useTranslations } from 'next-intl'
import { savePowerOfAttorneyAction } from '@/app/[locale]/application/actions'
import { poaTypeLabels } from '@/lib/reference/capacities'
import { Field, Input } from '@/components/ui/form'
import { Notice } from '@/components/ui/notice'
import { ChoiceGroup, ChoiceOption } from './choice'
import { ActionForm, useFieldError } from '@/components/forms/action-form'
import { WhyWeAsk } from './why-we-ask'

/**
 * Step 2 — the power of attorney. REQ-REG-041.
 *
 * Only reached when the applicant chose "agent"; the step does not exist
 * otherwise and the progress count says so.
 *
 * The two declarations at the bottom are separate checkboxes because they are
 * separate assertions: a power of attorney can be perfectly valid on its face
 * and worthless because the principal has died, and that is the failure the
 * second one is for. One combined "I confirm the power of attorney" would
 * record neither.
 */
export function PowerOfAttorneyForm({
  applicationId,
  defaults,
}: {
  applicationId: string
  defaults: {
    poaType: string | null
    number: string | null
    year: number | null
    notarisationOffice: string | null
    notarisedOn: string | null
  }
}) {
  const t = useTranslations('apply')
  const locale = useLocale() as 'ar' | 'en'

  return (
    <ActionForm
      action={savePowerOfAttorneyAction}
      applicationId={applicationId}
      submitLabel={t('saveAndContinue')}
      onSavedGoTo="/application"
    >
      <ChoiceGroup
        legend={t('poaType')}
        errorFor="poaType"
      >
        {(['GENERAL', 'SPECIAL'] as const).map((type) => (
          <ChoiceOption
            key={type}
            name="poaType"
            value={type}
            label={locale === 'ar' ? poaTypeLabels[type].ar : poaTypeLabels[type].en}
            help={locale === 'ar' ? poaTypeLabels[type].helpAr : poaTypeLabels[type].helpEn}
            defaultChecked={defaults.poaType === type}
          />
        ))}
      </ChoiceGroup>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={t('poaNumber')}
          htmlFor="number"
          hint={t('digitsOnlyHint')}
          required
          errorFor="number"
        >
          <Input name="number" defaultValue={defaults.number ?? ''} inputMode="numeric" dir="ltr" className="font-mono" />
        </Field>

        <Field label={t('poaYear')} htmlFor="year" required errorFor="year">
          <Input
            name="year"
            defaultValue={defaults.year ?? ''}
            inputMode="numeric"
            maxLength={4}
            dir="ltr"
            className="font-mono"
          />
        </Field>
      </div>

      <Field
        label={t('poaOffice')}
        htmlFor="notarisationOffice"
        required
        errorFor="notarisationOffice"
      >
        <Input name="notarisationOffice" defaultValue={defaults.notarisationOffice ?? ''} />
      </Field>

      <Field label={t('poaNotarisedOn')} htmlFor="notarisedOn" errorFor="notarisedOn">
        <Input name="notarisedOn" type="date" defaultValue={defaults.notarisedOn ?? ''} dir="ltr" />
      </Field>

      <WhyWeAsk label={t('whyWeAsk')}>{t('whyPoa')}</WhyWeAsk>

      <div className="space-y-3 border-t border-rule pt-6">
        <Notice tone="caution">{t('declarationsWarning')}</Notice>

        <ChoiceGroup legend={t('poaTitle')} description={t('poaLead')}>
          <ChoiceOption
            type="checkbox"
            name="declaresStillValid"
            value="on"
            label={t('poaDeclareValid')}
          />
          <ChoiceOption
            type="checkbox"
            name="declaresPrincipalAlive"
            value="on"
            label={t('poaDeclarePrincipalAlive')}
          />
        </ChoiceGroup>

        <DeclarationErrors />
      </div>
    </ActionForm>
  )
}

/**
 * The two declarations are checkboxes inside a group, so their errors have no
 * field to attach to visually. Hoisting them under the group means a refused
 * submission says which of the two was not ticked instead of silently
 * refusing.
 */
function DeclarationErrors() {
  const valid = useFieldError('declaresStillValid')
  const alive = useFieldError('declaresPrincipalAlive')
  if (!valid && !alive) return null

  return (
    <p role="alert" className="text-xs text-blocking">
      {valid ?? alive}
    </p>
  )
}
