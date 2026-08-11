'use client'

import * as React from 'react'
import { useLocale, useTranslations } from 'next-intl'
import {
  assignExaminerAction,
  issueCardAction,
  recordDeliveryAction,
  recordFeesAction,
  recordIntakeAction,
} from '@/app/[locale]/applications/actions'
import { ActionForm } from '@/components/forms/action-form'
import { Field, Input, Select } from '@/components/ui/form'
import { Panel } from '@/components/ui/panel'
import { Notice } from '@/components/ui/notice'
import { ChoiceGroup, ChoiceOption } from '@/components/application/choice'
import { paymentMethodLabels } from '@/lib/reference/capacities'
import type { PaymentMethod } from '@prisma/client'

/**
 * Steps 4, 5, and 6 — fees, the card, and its delivery.
 *
 * One screen for three steps, because they are one visit: the applicant comes
 * to the counter, pays, and leaves with the card. Splitting them across three
 * pages would have digitised the workflow diagram rather than the work.
 */

export interface FeeHeading {
  key: string
  label: string
  mandatory: boolean
}

/**
 * Fees. REQ-REG-050 step 4.
 *
 * Every amount is typed in, because the legal reference states no tariff for
 * any of the eight headings and inventing one would put invented figures on a
 * receipt. The notice on the screen says so, in words, rather than leaving the
 * treasurer to wonder why the fields are empty.
 */
export function FeesForm({
  applicationId,
  headings,
}: {
  applicationId: string
  headings: FeeHeading[]
}) {
  const t = useTranslations('gov')
  const locale = useLocale() as 'ar' | 'en'
  const [method, setMethod] = React.useState<PaymentMethod>('CASH')
  const [amounts, setAmounts] = React.useState<Record<string, string>>({})

  /*
   * The errors used to be read here, hoisted out of the JSX so that the three
   * bank fields — rendered only when the method is not cash — could not change
   * the hook count between renders. That solved the hook-order problem and
   * created a worse one: this component sits *above* `ActionForm`'s provider,
   * so all five lookups read the default context and no fee-form error has ever
   * been shown. `errorFor` moves each lookup into the control that draws it,
   * where the provider is above it — and where the hook-order concern does not
   * arise either, because a conditionally *rendered component* counts its own
   * hooks. See src/components/forms/form-state.tsx.
   */
  const lines = headings
    .map((heading) => ({ feeKey: heading.key, amount: amounts[heading.key] ?? '' }))
    .filter((line) => line.amount.trim() !== '')

  const total = lines.reduce((sum, line) => sum + Number(line.amount.replace(/[,\s]/g, '') || 0), 0)

  return (
    <Panel title={t('feesTitle')} description={t('feesLead')}>
      <Notice tone="informational" className="mb-4">
        {t('feesNoTariffNotice')}
      </Notice>

      <ActionForm
        action={recordFeesAction}
        applicationId={applicationId}
        submitLabel={t('recordFees')}
        showAutoSaveNote={false}
      >
        <input type="hidden" name="lines" value={JSON.stringify(lines)} />

        <ChoiceGroup legend={t('paymentMethod')} errorFor="paymentMethod">
          {(Object.keys(paymentMethodLabels) as PaymentMethod[]).map((value) => (
            <ChoiceOption
              key={value}
              name="paymentMethod"
              value={value}
              label={paymentMethodLabels[value][locale]}
              checked={method === value}
              onChange={(checked) => checked && setMethod(value)}
            />
          ))}
        </ChoiceGroup>

        <Field label={t('receiptNumber')} htmlFor="receiptNumber" required errorFor="receiptNumber">
          <Input name="receiptNumber" dir="ltr" className="font-mono" />
        </Field>

        {method !== 'CASH' ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t('bankName')} htmlFor="bankName" required errorFor="bankName">
              <Input name="bankName" />
            </Field>
            <Field label={t('bankBranch')} htmlFor="bankBranch" required errorFor="bankBranch">
              <Input name="bankBranch" />
            </Field>
            <Field label={t('chequeNumber')} htmlFor="chequeNumber" errorFor="chequeNumber">
              <Input name="chequeNumber" dir="ltr" className="font-mono" />
            </Field>
          </div>
        ) : null}

        <div className="divide-y divide-rule border border-rule">
          {headings.map((heading) => (
            <div key={heading.key} className="flex items-center gap-3 px-3 py-2">
              <label
                htmlFor={`fee-${heading.key}`}
                className="min-w-0 flex-1 text-sm text-ink"
              >
                {heading.label}
              </label>
              <Input
                id={`fee-${heading.key}`}
                inputMode="numeric"
                dir="ltr"
                className="tabular w-36"
                value={amounts[heading.key] ?? ''}
                onChange={(event) => {
                  // Read the value before the updater runs: React may invoke a functional
                  // updater after the event has been recycled, when currentTarget is null.
                  const value = event.currentTarget.value
                  setAmounts((current) => ({ ...current, [heading.key]: value }))
                }}
              />
            </div>
          ))}
          <div className="flex items-center gap-3 bg-paper-sunk px-3 py-2">
            <span className="min-w-0 flex-1 text-sm font-semibold text-ink">{t('feeTotal')}</span>
            <span className="ltr-run w-36 text-end text-base font-semibold text-navy-700">
              {new Intl.NumberFormat('en-US').format(total)}
            </span>
          </div>
        </div>
      </ActionForm>
    </Panel>
  )
}

/** Step 5 — issue the card under a permanent registration number. */
export function IssueCardForm({ applicationId }: { applicationId: string }) {
  const t = useTranslations('gov')

  return (
    <Panel title={t('issuanceTitle')} description={t('issuanceLead')}>
      <ActionForm
        action={issueCardAction}
        applicationId={applicationId}
        submitLabel={t('issueCard')}
        showAutoSaveNote={false}
      >
        <span />
      </ActionForm>
    </Panel>
  )
}

/**
 * Step 6 — delivery, with the two acknowledgements.
 *
 * REQ-REG-050 step 5 requires the recipient to acknowledge the renewal date and
 * the obligation to print the registration number on all output. Two
 * checkboxes, not one, because they are two obligations and REQ-REG-061 is
 * enforced against the second.
 */
export function DeliveryForm({ applicationId }: { applicationId: string }) {
  const t = useTranslations('gov')

  return (
    <Panel title={t('deliveryTitle')} description={t('deliveryLead')}>
      <ActionForm
        action={recordDeliveryAction}
        applicationId={applicationId}
        submitLabel={t('recordDelivery')}
        showAutoSaveNote={false}
      >
        <Field
          label={t('deliveredToName')}
          htmlFor="deliveredToName"
          required
          errorFor="deliveredToName"
        >
          <Input name="deliveredToName" />
        </Field>

        <ChoiceGroup legend={t('deliveryTitle')} errorFor="renewalDateAcknowledged">
          <ChoiceOption
            type="checkbox"
            name="renewalDateAcknowledged"
            value="on"
            label={t('ackRenewal')}
          />
          <ChoiceOption
            type="checkbox"
            name="numberObligationAcknowledged"
            value="on"
            label={t('ackNumberObligation')}
          />
        </ChoiceGroup>
      </ActionForm>
    </Panel>
  )
}

/** Step 1 — intake. Assigns the temporary number and records the page count. */
export function IntakeForm({ applicationId }: { applicationId: string }) {
  const t = useTranslations('gov')

  return (
    <Panel title={t('intakeTitle')} description={t('intakeLead')}>
      <ActionForm
        action={recordIntakeAction}
        applicationId={applicationId}
        submitLabel={t('intakeRecord')}
        showAutoSaveNote={false}
      >
        <Field label={t('intakePageCount')} htmlFor="pageCount" required errorFor="pageCount">
          <Input name="pageCount" inputMode="numeric" dir="ltr" className="tabular" />
        </Field>
      </ActionForm>
    </Panel>
  )
}

/** Step 1b — assignment to an examiner. Never self-service. */
export function AssignExaminerForm({
  applicationId,
  examiners,
}: {
  applicationId: string
  examiners: Array<{ id: string; name: string }>
}) {
  const t = useTranslations('gov')

  return (
    <Panel title={t('intakeAssign')} description={t('intakeAssignLead')}>
      <ActionForm
        action={assignExaminerAction}
        applicationId={applicationId}
        submitLabel={t('intakeAssign')}
        showAutoSaveNote={false}
      >
        <Field label={t('intakeAssignee')} htmlFor="examinerId" required errorFor="examinerId">
          <Select name="examinerId" defaultValue="">
            <option value="" disabled>
              —
            </option>
            {examiners.map((examiner) => (
              <option key={examiner.id} value={examiner.id}>
                {examiner.name}
              </option>
            ))}
          </Select>
        </Field>
      </ActionForm>
    </Panel>
  )
}
