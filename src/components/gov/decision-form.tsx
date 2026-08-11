'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { decideAction } from '@/app/[locale]/applications/actions'
import { ActionForm } from '@/components/forms/action-form'
import { Field, Textarea } from '@/components/ui/form'
import { Panel } from '@/components/ui/panel'
import { ChoiceGroup, ChoiceOption } from '@/components/application/choice'

/**
 * Approve, or refuse with a reason. REQ-REG-050 step 3.
 *
 * Two radio options rather than two buttons, and the reason field appears the
 * moment "refuse" is chosen. Two buttons would let a refusal be one click away
 * from an approval on a screen an official uses forty times a day, and the
 * decision is the least reversible thing in this product.
 *
 * The note is validated as mandatory on the server for a refusal — the schema
 * requires ten characters — and the hint says so before the officer types.
 */
export function DecisionForm({ applicationId }: { applicationId: string }) {
  const t = useTranslations('gov')
  const [decision, setDecision] = React.useState<'APPROVE' | 'REJECT' | null>(null)

  return (
    <Panel title={t('reviewDecision')}>
      <ActionForm
        action={decideAction}
        applicationId={applicationId}
        submitLabel={decision === 'REJECT' ? t('reject') : t('approve')}
        showAutoSaveNote={false}
      >
        <ChoiceGroup legend={t('reviewDecision')} errorFor="decision">
          <ChoiceOption
            name="decision"
            value="APPROVE"
            label={t('approve')}
            onChange={(checked) => checked && setDecision('APPROVE')}
            checked={decision === 'APPROVE'}
          />
          <ChoiceOption
            name="decision"
            value="REJECT"
            label={t('reject')}
            onChange={(checked) => checked && setDecision('REJECT')}
            checked={decision === 'REJECT'}
          />
        </ChoiceGroup>

        <Field
          label={t('reviewNote')}
          htmlFor="note"
          hint={decision === 'REJECT' ? t('rejectReasonHint') : undefined}
          required={decision === 'REJECT'}
          errorFor="note"
        >
          <Textarea name="note" rows={4} />
        </Field>
      </ActionForm>
    </Panel>
  )
}
