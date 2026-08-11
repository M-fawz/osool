'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import type { BrokerType } from '@prisma/client'
import { cn } from '@/lib/cn'
import {
  recommendAction,
  requestCompletionsAction,
  saveExaminationAction,
} from '@/app/[locale]/applications/actions'
import { ActionForm, useFieldError } from '@/components/forms/action-form'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { Panel } from '@/components/ui/panel'
import { Notice } from '@/components/ui/notice'
import { Status } from '@/components/ui/status'
import { Check, FileSearch, Icon, X } from '@/components/ui/icon'
import { ChoiceGroup, ChoiceOption } from '@/components/application/choice'

/**
 * The examiner's screen.
 *
 * The one screen that decides whether officials adopt the system, so it is
 * built around the single job it does rather than around the data it holds:
 *
 *   **Does what was submitted match what was supplied?**
 *
 * Everything follows from that. The internal review form (REQ-REG-051) is not
 * a separate form to fill in after reading the file — it *is* the comparison.
 * Each of its sixteen lines carries three things on one row: the fact as the
 * applicant declared it, the document it is meant to be checked against, and
 * the tick. Selecting a line puts its document in the pane beside it. The
 * examiner never navigates away from the thing they are comparing, because the
 * comparison is the row they are standing on.
 *
 * The document pane is sticky and sits on the inline-end edge — the right in
 * Arabic, the left in English — so it stays beside the form as the form
 * scrolls. Below `lg` the two stack, because a 900px screen split in two gives
 * an examiner two columns too narrow to read an Arabic trade name in.
 */

export interface ReviewLine {
  fieldKey: string
  label: string
  /** The fact as the applicant declared it, already formatted. */
  declared: string | null
  /** The document that answers this line, if the checklist names one. */
  evidenceDocumentId: string | null
  evidenceLabel: string | null
  evidenceMimeType: string | null
  /** True when the checklist names a document and none was supplied. */
  evidenceMissing: boolean
  verified: boolean
}

export interface CompletionChoice {
  key: string
  label: string
}

export interface OutstandingCompletion {
  itemNumber: number
  descriptionAr: string
  descriptionEn: string | null
  checklistItemKey: string | null
  round: number
}

export function ExaminationScreen({
  applicationId,
  lines,
  types,
  completionChoices,
  outstanding,
  defaults,
  canSign,
}: {
  applicationId: string
  lines: ReviewLine[]
  types: Array<{ key: BrokerType; label: string }>
  completionChoices: CompletionChoice[]
  outstanding: OutstandingCompletion[]
  defaults: {
    originalCount: number
    copyCount: number
    brokerageNature: BrokerType[]
    proposedValidFrom: string
    proposedValidTo: string
    recommendation: string | null
    examinerNote: string | null
  }
  canSign: boolean
}) {
  const t = useTranslations('gov')
  const [selected, setSelected] = React.useState<ReviewLine | null>(
    lines.find((line) => line.evidenceDocumentId) ?? null,
  )

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:items-start">
      <div className="min-w-0 space-y-6">
        {outstanding.length > 0 ? (
          <Panel title={t('completionsTitle')}>
            <ol className="space-y-2">
              {outstanding.map((item) => (
                <li key={item.itemNumber} className="flex items-start gap-3">
                  <span className="ltr-run mt-0.5 shrink-0 text-sm font-semibold text-caution">
                    {item.itemNumber}.
                  </span>
                  <p className="min-w-0 flex-1 text-sm text-ink">{item.descriptionAr}</p>
                </li>
              ))}
            </ol>
          </Panel>
        ) : null}

        <ReviewForm
          applicationId={applicationId}
          lines={lines}
          types={types}
          defaults={defaults}
          selectedKey={selected?.fieldKey ?? null}
          onSelect={setSelected}
          canSign={canSign}
        />

        <CompletionsComposer applicationId={applicationId} choices={completionChoices} />
      </div>

      <DocumentPane line={selected} />
    </div>
  )
}

/**
 * The internal review form. REQ-REG-051.
 *
 * A table rather than a stack of fields, because sixteen lines with the same
 * three columns *is* a table, and an examiner scanning for the unticked ones
 * needs the ticks in a column.
 */
function ReviewForm({
  applicationId,
  lines,
  types,
  defaults,
  selectedKey,
  onSelect,
  canSign,
}: {
  applicationId: string
  lines: ReviewLine[]
  types: Array<{ key: BrokerType; label: string }>
  defaults: {
    originalCount: number
    copyCount: number
    brokerageNature: BrokerType[]
    proposedValidFrom: string
    proposedValidTo: string
    recommendation: string | null
    examinerNote: string | null
  }
  selectedKey: string | null
  onSelect: (line: ReviewLine) => void
  canSign: boolean
}) {
  const t = useTranslations('gov')
  const verifiedCount = lines.filter((line) => line.verified).length

  return (
    <Panel title={t('examinationFormTitle')} description={t('examinationFormLead')} flush>
      <ActionForm
        action={saveExaminationAction}
        applicationId={applicationId}
        submitLabel={t('saveExamination')}
        showAutoSaveNote={false}
        className="!space-y-0"
      >
        <div className="border-b border-rule px-4 py-2 text-xs text-ink-muted" aria-live="polite">
          <span className="ltr-run font-medium">
            {verifiedCount}/{lines.length}
          </span>{' '}
          {t('verifyField')}
        </div>

        <ul className="divide-y divide-rule">
          {lines.map((line) => (
            <li
              key={line.fieldKey}
              className={cn(
                'flex items-start gap-3 px-4 py-2.5',
                selectedKey === line.fieldKey && 'bg-navy-50',
              )}
            >
              <label className="flex min-h-8 cursor-pointer items-center">
                <input
                  type="checkbox"
                  name="verifiedFieldKeys"
                  value={line.fieldKey}
                  defaultChecked={line.verified}
                  className="peer sr-only"
                />
                {/* The tick is always drawn and only its colour changes.
                    `peer-checked:` compiles to a *sibling* selector, so a class
                    on the icon inside this span would never match the input —
                    a mistake that produces a checkbox which silently never
                    shows its tick. */}
                <span
                  aria-hidden="true"
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-xs border border-rule-strong bg-paper text-transparent peer-checked:border-navy-600 peer-checked:bg-navy-600 peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-navy-600"
                >
                  <Icon as={Check} size="xs" />
                </span>
                <span className="sr-only">
                  {t('verifyField')}: {line.label}
                </span>
              </label>

              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-ink-muted">{line.label}</p>
                <p className="mt-0.5 break-words text-sm text-ink">
                  {line.declared ? <bdi>{line.declared}</bdi> : <span className="text-ink-faint">—</span>}
                </p>
              </div>

              <div className="shrink-0">
                {line.evidenceDocumentId ? (
                  <button
                    type="button"
                    onClick={() => onSelect(line)}
                    className="inline-flex min-h-8 items-center gap-1.5 rounded-xs px-2 text-xs font-medium text-navy-600 hover:bg-navy-50 hover:underline"
                  >
                    <Icon as={FileSearch} size="xs" />
                    <span className="max-w-32 truncate">{line.evidenceLabel}</span>
                  </button>
                ) : line.evidenceMissing ? (
                  <Status tone="caution" size="sm">
                    {t('completionsOutstanding')}
                  </Status>
                ) : (
                  <span className="text-2xs text-ink-faint">{t('noEvidenceDocument')}</span>
                )}
              </div>
            </li>
          ))}
        </ul>

        <div className="space-y-4 border-t border-rule p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('originalCount')} htmlFor="originalCount" error={useFieldError('originalCount')}>
              <Input
                name="originalCount"
                inputMode="numeric"
                defaultValue={defaults.originalCount}
                dir="ltr"
                className="tabular"
              />
            </Field>
            <Field label={t('copyCount')} htmlFor="copyCount" error={useFieldError('copyCount')}>
              <Input
                name="copyCount"
                inputMode="numeric"
                defaultValue={defaults.copyCount}
                dir="ltr"
                className="tabular"
              />
            </Field>
          </div>

          <ChoiceGroup legend={t('brokerageNature')} error={useFieldError('brokerageNature')}>
            {types.map((type) => (
              <ChoiceOption
                key={type.key}
                type="checkbox"
                name="brokerageNature"
                value={type.key}
                label={type.label}
                defaultChecked={defaults.brokerageNature.includes(type.key)}
              />
            ))}
          </ChoiceGroup>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t('proposedValidFrom')}
              htmlFor="proposedValidFrom"
              required
              error={useFieldError('proposedValidFrom')}
            >
              <Input
                name="proposedValidFrom"
                type="date"
                defaultValue={defaults.proposedValidFrom}
                dir="ltr"
              />
            </Field>
            <Field
              label={t('proposedValidTo')}
              htmlFor="proposedValidTo"
              required
              error={useFieldError('proposedValidTo')}
            >
              <Input
                name="proposedValidTo"
                type="date"
                defaultValue={defaults.proposedValidTo}
                dir="ltr"
              />
            </Field>
          </div>

          <Field label={t('recommendation')} htmlFor="recommendation" required error={useFieldError('recommendation')}>
            <Select name="recommendation" defaultValue={defaults.recommendation ?? ''}>
              <option value="" disabled>
                —
              </option>
              <option value="RECOMMEND_APPROVAL">{t('recommendApproval')}</option>
              <option value="RECOMMEND_REFUSAL">{t('recommendRefusal')}</option>
            </Select>
          </Field>

          <Field label={t('examinerNote')} htmlFor="examinerNote" error={useFieldError('examinerNote')}>
            <Textarea name="examinerNote" rows={3} defaultValue={defaults.examinerNote ?? ''} />
          </Field>
        </div>
      </ActionForm>

      {canSign ? (
        <div className="border-t border-rule p-4">
          <ActionForm
            action={recommendAction}
            applicationId={applicationId}
            submitLabel={t('sendToReview')}
            showAutoSaveNote={false}
            className="!space-y-0"
          >
            <span />
          </ActionForm>
        </div>
      ) : null}
    </Panel>
  )
}

/**
 * The document, beside the data.
 *
 * `position: sticky` at the top of the viewport so it holds its place while the
 * review form scrolls. An inline frame renders a PDF and an image element
 * renders a photograph, both fetched through the authorised, audited document
 * route — which means every one of these views is recorded under REQ-DPA-002,
 * exactly as it should be.
 */
function DocumentPane({ line }: { line: ReviewLine | null }) {
  const t = useTranslations('gov')
  const isPdf = line?.evidenceMimeType === 'application/pdf'

  return (
    <aside className="lg:sticky lg:top-20">
      <Panel title={t('attachedDocuments')} flush>
        {line?.evidenceDocumentId ? (
          <div>
            <p className="border-b border-rule px-4 py-2 text-xs text-ink-muted">
              {t('evidenceFrom', { label: line.evidenceLabel ?? '' })}
            </p>
            {isPdf ? (
              <iframe
                src={`/api/documents/${line.evidenceDocumentId}`}
                title={line.evidenceLabel ?? ''}
                className="h-[36rem] w-full border-0 bg-paper-sunk"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/documents/${line.evidenceDocumentId}`}
                alt={line.evidenceLabel ?? ''}
                className="max-h-[36rem] w-full bg-paper-sunk object-contain"
              />
            )}
            <div className="border-t border-rule px-4 py-2">
              <a
                href={`/api/documents/${line.evidenceDocumentId}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-medium text-navy-600 hover:underline"
              >
                {t('openFile')}
              </a>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <Icon as={FileSearch} size="lg" className="text-ink-faint" />
            <p className="text-sm text-ink-muted">{t('noEvidenceDocument')}</p>
          </div>
        )}
      </Panel>
    </aside>
  )
}

/**
 * Composing الاستيفاءات.
 *
 * §5: "AWAITING_COMPLETION requires at least one structured completion item —
 * free text alone is not accepted, because الاستيفاءات is the most exploitable
 * step in the paper process and must be itemised to be auditable."
 *
 * So the composer builds a list, and each row asks which documented requirement
 * it cites. That field is *not* mandatory: an item with no basis in the
 * checklist is exactly what 00-VISION §5's sixteenth signal counts, and a field
 * that cannot be left blank can never produce that count.
 */
function CompletionsComposer({
  applicationId,
  choices,
}: {
  applicationId: string
  choices: CompletionChoice[]
}) {
  const t = useTranslations('gov')
  const tCommon = useTranslations('common')
  const [items, setItems] = React.useState<
    Array<{ checklistItemKey: string; descriptionAr: string; descriptionEn: string }>
  >([])

  const [draft, setDraft] = React.useState({
    checklistItemKey: '',
    descriptionAr: '',
    descriptionEn: '',
  })

  return (
    <Panel title={t('completionsTitle')} description={t('completionsLead')}>
      {items.length > 0 ? (
        <ol className="mb-4 divide-y divide-rule border border-rule">
          {items.map((item, index) => (
            <li key={index} className="flex items-start gap-3 px-3 py-2.5">
              <span className="ltr-run mt-0.5 shrink-0 text-sm font-semibold text-ink-faint">
                {index + 1}.
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink">{item.descriptionAr}</p>
                <p className="mt-0.5 text-2xs text-ink-faint">
                  {item.checklistItemKey
                    ? (choices.find((c) => c.key === item.checklistItemKey)?.label ??
                      item.checklistItemKey)
                    : t('completionChecklistNone')}
                </p>
              </div>
              <button
                type="button"
                aria-label={tCommon('remove')}
                onClick={() => setItems((current) => current.filter((_, i) => i !== index))}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xs text-ink-faint hover:bg-paper-sunk hover:text-blocking"
              >
                <Icon as={X} size="sm" />
              </button>
            </li>
          ))}
        </ol>
      ) : null}

      <div className="space-y-3 border border-rule p-3">
        <Field label={t('completionChecklistItem')} htmlFor="completion-item">
          <Select
            id="completion-item"
            value={draft.checklistItemKey}
            onChange={(event) => {
              // Read the value before the updater runs: React may invoke a functional
              // updater after the event has been recycled, when currentTarget is null.
              const value = event.currentTarget.value
              setDraft((current) => ({ ...current, checklistItemKey: value }))
            }}
          >
            <option value="">{t('completionChecklistNone')}</option>
            {choices.map((choice) => (
              <option key={choice.key} value={choice.key}>
                {choice.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t('completionDescriptionAr')} htmlFor="completion-ar" required>
          <Textarea
            id="completion-ar"
            rows={2}
            value={draft.descriptionAr}
            onChange={(event) => {
              const value = event.currentTarget.value
              setDraft((current) => ({ ...current, descriptionAr: value }))
            }}
            lang="ar"
            dir="rtl"
          />
        </Field>

        <Field label={t('completionDescriptionEn')} htmlFor="completion-en">
          <Textarea
            id="completion-en"
            rows={2}
            value={draft.descriptionEn}
            onChange={(event) => {
              const value = event.currentTarget.value
              setDraft((current) => ({ ...current, descriptionEn: value }))
            }}
            lang="en"
            dir="ltr"
          />
        </Field>

        <Button
          type="button"
          variant="secondary"
          disabled={draft.descriptionAr.trim().length === 0}
          onClick={() => {
            setItems((current) => [...current, { ...draft }])
            setDraft({ checklistItemKey: '', descriptionAr: '', descriptionEn: '' })
          }}
        >
          {t('completionAdd')}
        </Button>
      </div>

      {items.length === 0 ? (
        <Notice tone="informational" className="mt-4">
          {t('completionsLead')}
        </Notice>
      ) : (
        <div className="mt-4">
          <ActionForm
            action={requestCompletionsAction}
            applicationId={applicationId}
            submitLabel={t('requestCompletions')}
            showAutoSaveNote={false}
            className="!space-y-0"
          >
            <input
              type="hidden"
              name="items"
              value={JSON.stringify(
                items.map((item) => ({
                  checklistItemKey: item.checklistItemKey || undefined,
                  descriptionAr: item.descriptionAr,
                  descriptionEn: item.descriptionEn || undefined,
                })),
              )}
            />
          </ActionForm>
        </div>
      )}
    </Panel>
  )
}
