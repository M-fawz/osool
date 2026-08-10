'use client'

import * as React from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { AuthenticationBody, BrokerType, Governorate } from '@prisma/client'
import {
  archiveContractAction,
  saveContractAction,
} from '@/app/[locale]/application/actions'
import { authenticationBodyLabels } from '@/lib/reference/capacities'
import { GOVERNORATE_ORDER, governorateLabels } from '@/lib/reference/governorates'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { EmptyState, KeyValue, KeyValueItem, Panel } from '@/components/ui/panel'
import { FileSearch } from '@/components/ui/icon'
import { Ltr, Money, Stamp } from '@/components/ui/bidi'
import { ChoiceGroup, ChoiceOption } from './choice'
import { ActionForm, useFieldError } from '@/components/forms/action-form'
import { WhyWeAsk } from './why-we-ask'

/**
 * Step 5 — brokerage contract data. REQ-REG-030.
 *
 * A list plus one form, rather than a form with an "add another" that grows
 * down the page. Two reasons, both about the phone: a repeating fieldset gets
 * unusable at the third repetition on a 390px screen, and a contract that has
 * been saved should visibly *be* saved — a card in a list says that, a filled-in
 * fieldset does not.
 *
 * Removal archives. Nothing here is deleted (CLAUDE.md rule 2), and the copy
 * says so plainly rather than letting the applicant believe otherwise.
 */

export interface ContractRow {
  id: string
  position: number
  clientNameAr: string
  clientNameEn: string
  clientNationality: string
  authenticationBody: AuthenticationBody
  authenticationNumber: string
  validFrom: string
  validTo: string
  capacityActedIn: BrokerType
  contractValue: number | null
  subjectDescription: string
  subjectAddress: string
  governorate: Governorate | null
}

export interface ContractTypeOption {
  key: BrokerType
  label: string
}

export function ContractsStep({
  applicationId,
  contracts,
  types,
  continueHref,
}: {
  applicationId: string
  contracts: ContractRow[]
  types: ContractTypeOption[]
  continueHref: string
}) {
  const t = useTranslations('apply')
  const [editing, setEditing] = React.useState<ContractRow | null>(null)
  const [adding, setAdding] = React.useState(contracts.length === 0)

  const showForm = adding || editing !== null

  return (
    <div className="space-y-6">
      {contracts.length === 0 && !showForm ? (
        <Panel flush>
          <EmptyState
            icon={FileSearch}
            title={t('contractsEmptyTitle')}
            description={t('contractsEmptyLead')}
            action={
              <Button size="touch" onClick={() => setAdding(true)}>
                {t('addContract')}
              </Button>
            }
          />
        </Panel>
      ) : null}

      {contracts.map((contract) => (
        <ContractCard
          key={contract.id}
          applicationId={applicationId}
          contract={contract}
          types={types}
          onEdit={() => {
            setEditing(contract)
            setAdding(false)
          }}
        />
      ))}

      {showForm ? (
        <Panel title={t('contractNumber', { n: editing?.position ?? contracts.length + 1 })}>
          <ContractForm
            applicationId={applicationId}
            contract={editing}
            types={types}
            onCancel={
              contracts.length > 0
                ? () => {
                    setEditing(null)
                    setAdding(false)
                  }
                : undefined
            }
          />
        </Panel>
      ) : (
        <div className="flex flex-wrap gap-3">
          <Button size="touch" variant="secondary" onClick={() => setAdding(true)}>
            {t('addContract')}
          </Button>
          {contracts.length > 0 ? (
            <Button size="touch" asChild>
              <a href={continueHref}>{t('saveAndContinue')}</a>
            </Button>
          ) : null}
        </div>
      )}
    </div>
  )
}

function ContractCard({
  applicationId,
  contract,
  onEdit,
}: {
  applicationId: string
  contract: ContractRow
  types: ContractTypeOption[]
  onEdit: () => void
}) {
  const t = useTranslations('apply')
  const tCommon = useTranslations('common')
  const locale = useLocale() as 'ar' | 'en'

  return (
    <Panel title={t('contractNumber', { n: contract.position })}>
      <KeyValue columns={2}>
        <KeyValueItem label={t('clientNameAr')}>
          <bdi>{contract.clientNameAr}</bdi>
        </KeyValueItem>
        <KeyValueItem label={t('clientNameEn')}>
          <bdi dir="ltr">{contract.clientNameEn}</bdi>
        </KeyValueItem>
        <KeyValueItem label={t('clientNationality')}>{contract.clientNationality}</KeyValueItem>
        <KeyValueItem label={t('authenticationBody')}>
          {authenticationBodyLabels[contract.authenticationBody][locale]} ·{' '}
          <Ltr>{contract.authenticationNumber}</Ltr>
        </KeyValueItem>
        <KeyValueItem label={t('contractValidFrom')}>
          <Stamp value={contract.validFrom} /> — <Stamp value={contract.validTo} />
        </KeyValueItem>
        {contract.contractValue !== null ? (
          <KeyValueItem label={t('contractValue')}>
            <Money amount={contract.contractValue} locale={locale} />
          </KeyValueItem>
        ) : null}
        <KeyValueItem label={t('subjectDescription')} className="sm:col-span-2">
          {contract.subjectDescription}
        </KeyValueItem>
        <KeyValueItem label={t('subjectAddress')} className="sm:col-span-2">
          {contract.subjectAddress}
        </KeyValueItem>
      </KeyValue>

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-rule pt-4">
        <Button size="touch" variant="secondary" onClick={onEdit}>
          {tCommon('edit')}
        </Button>
        <RemoveContract applicationId={applicationId} contractId={contract.id} />
      </div>
    </Panel>
  )
}

function RemoveContract({
  applicationId,
  contractId,
}: {
  applicationId: string
  contractId: string
}) {
  const t = useTranslations('apply')
  const tCommon = useTranslations('common')
  const [confirming, setConfirming] = React.useState(false)

  if (!confirming) {
    return (
      <Button size="touch" variant="ghost" onClick={() => setConfirming(true)}>
        {tCommon('remove')}
      </Button>
    )
  }

  return (
    <div className="flex w-full flex-wrap items-center gap-3 border border-caution/30 bg-caution-soft px-3 py-2.5">
      <p className="min-w-0 flex-1 text-sm text-ink">{t('removeContractConfirm')}</p>
      <ActionForm
        action={archiveContractAction}
        applicationId={applicationId}
        submitLabel={tCommon('confirm')}
        className="!space-y-0"
        showAutoSaveNote={false}
      >
        <input type="hidden" name="contractId" value={contractId} />
      </ActionForm>
      <Button size="touch" variant="ghost" onClick={() => setConfirming(false)}>
        {tCommon('cancel')}
      </Button>
    </div>
  )
}

function ContractForm({
  applicationId,
  contract,
  types,
  onCancel,
}: {
  applicationId: string
  contract: ContractRow | null
  types: ContractTypeOption[]
  onCancel?: () => void
}) {
  const t = useTranslations('apply')
  const tCommon = useTranslations('common')
  const locale = useLocale() as 'ar' | 'en'

  return (
    <ActionForm
      action={saveContractAction}
      applicationId={applicationId}
      submitLabel={tCommon('save')}
      secondary={
        onCancel ? (
          <Button type="button" size="touch" variant="ghost" onClick={onCancel}>
            {tCommon('cancel')}
          </Button>
        ) : undefined
      }
    >
      {contract ? <input type="hidden" name="contractId" value={contract.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('clientNameAr')} htmlFor="clientNameAr" required error={useFieldError('clientNameAr')}>
          <Input name="clientNameAr" defaultValue={contract?.clientNameAr ?? ''} lang="ar" dir="rtl" />
        </Field>
        <Field label={t('clientNameEn')} htmlFor="clientNameEn" required error={useFieldError('clientNameEn')}>
          <Input name="clientNameEn" defaultValue={contract?.clientNameEn ?? ''} lang="en" dir="ltr" />
        </Field>
      </div>
      <WhyWeAsk label={t('whyWeAsk')}>{t('whyClientNames')}</WhyWeAsk>

      <Field
        label={t('clientNationality')}
        htmlFor="clientNationality"
        required
        error={useFieldError('clientNationality')}
      >
        <Input name="clientNationality" defaultValue={contract?.clientNationality ?? ''} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={t('authenticationBody')}
          htmlFor="authenticationBody"
          required
          error={useFieldError('authenticationBody')}
        >
          <Select name="authenticationBody" defaultValue={contract?.authenticationBody ?? ''}>
            <option value="" disabled>
              —
            </option>
            {(Object.keys(authenticationBodyLabels) as AuthenticationBody[]).map((body) => (
              <option key={body} value={body}>
                {authenticationBodyLabels[body][locale]}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label={t('authenticationNumber')}
          htmlFor="authenticationNumber"
          required
          error={useFieldError('authenticationNumber')}
        >
          <Input
            name="authenticationNumber"
            defaultValue={contract?.authenticationNumber ?? ''}
            dir="ltr"
            className="font-mono"
          />
        </Field>
      </div>
      <WhyWeAsk label={t('whyWeAsk')}>{t('whyAuthentication')}</WhyWeAsk>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('contractValidFrom')} htmlFor="validFrom" required error={useFieldError('validFrom')}>
          <Input name="validFrom" type="date" defaultValue={contract?.validFrom ?? ''} dir="ltr" />
        </Field>
        <Field label={t('contractValidTo')} htmlFor="validTo" required error={useFieldError('validTo')}>
          <Input name="validTo" type="date" defaultValue={contract?.validTo ?? ''} dir="ltr" />
        </Field>
      </div>

      <ChoiceGroup legend={t('capacityActedIn')} error={useFieldError('capacityActedIn')}>
        {types.map((type) => (
          <ChoiceOption
            key={type.key}
            name="capacityActedIn"
            value={type.key}
            label={type.label}
            defaultChecked={contract?.capacityActedIn === type.key}
          />
        ))}
      </ChoiceGroup>

      <Field
        label={t('contractValue')}
        hint={tCommon('optional')}
        htmlFor="contractValue"
        error={useFieldError('contractValue')}
      >
        <Input
          name="contractValue"
          inputMode="numeric"
          defaultValue={contract?.contractValue ?? ''}
          dir="ltr"
          className="tabular"
        />
      </Field>

      <Field
        label={t('subjectDescription')}
        htmlFor="subjectDescription"
        required
        error={useFieldError('subjectDescription')}
      >
        <Textarea name="subjectDescription" rows={3} defaultValue={contract?.subjectDescription ?? ''} />
      </Field>

      <Field
        label={t('subjectAddress')}
        htmlFor="subjectAddress"
        required
        error={useFieldError('subjectAddress')}
      >
        <Input name="subjectAddress" defaultValue={contract?.subjectAddress ?? ''} />
      </Field>

      <Field
        label={t('governorate')}
        hint={tCommon('optional')}
        htmlFor="governorate"
        error={useFieldError('governorate')}
      >
        <Select name="governorate" defaultValue={contract?.governorate ?? ''}>
          <option value="">—</option>
          {GOVERNORATE_ORDER.map((g) => (
            <option key={g} value={g}>
              {governorateLabels[g][locale]}
            </option>
          ))}
        </Select>
      </Field>
    </ActionForm>
  )
}
