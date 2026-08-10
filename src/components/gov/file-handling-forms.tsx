'use client'

import { useTranslations } from 'next-intl'
import {
  recordArchiveAction,
  recordDataExtractionAction,
} from '@/app/[locale]/applications/actions'
import { ActionForm, useFieldError } from '@/components/forms/action-form'
import { Field, Input, Textarea } from '@/components/ui/form'
import { Panel } from '@/components/ui/panel'

/**
 * Steps 7 and 8 — data extraction and archiving.
 *
 * The last two hands the paper file passes through, and the two that are
 * easiest to leave out of a digitisation because they decide nothing. They are
 * here for the same reason the register keeps them on paper: a file that
 * reached delivery and was never filed is a file nobody can find, and "where is
 * it?" is a question the system should be able to answer rather than one an
 * official has to walk downstairs to resolve.
 */

export function DataExtractionForm({ applicationId }: { applicationId: string }) {
  const t = useTranslations('gov')

  return (
    <Panel title={t('recordsTitle')} description={t('recordsLead')}>
      <ActionForm
        action={recordDataExtractionAction}
        applicationId={applicationId}
        submitLabel={t('recordDataExtraction')}
        showAutoSaveNote={false}
      >
        <Field label={t('dataNote')} htmlFor="dataNote" error={useFieldError('dataNote')}>
          <Textarea name="dataNote" rows={3} />
        </Field>
      </ActionForm>
    </Panel>
  )
}

export function ArchiveForm({
  applicationId,
  intakePageCount,
}: {
  applicationId: string
  /** What the registry clerk counted at the counter, for comparison. */
  intakePageCount: number | null
}) {
  const t = useTranslations('gov')
  const tCommon = useTranslations('common')

  return (
    <Panel title={t('archiveTitle')} description={t('archiveLead')}>
      <ActionForm
        action={recordArchiveAction}
        applicationId={applicationId}
        submitLabel={t('recordArchive')}
        showAutoSaveNote={false}
      >
        <Field
          label={t('pageCount')}
          htmlFor="pageCount"
          // Shown, not pre-filled. Pre-filling the intake count would turn the
          // second count into a formality, and the whole point of counting
          // twice is that the two counts are independent.
          hint={
            intakePageCount === null
              ? undefined
              : t('intakeRecordedPages', { intake: intakePageCount })
          }
          required
          error={useFieldError('pageCount')}
        >
          <Input name="pageCount" inputMode="numeric" dir="ltr" className="tabular" />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t('serialRegisterNo')}
            htmlFor="serialRegisterNo"
            required
            error={useFieldError('serialRegisterNo')}
          >
            <Input name="serialRegisterNo" dir="ltr" className="font-mono" />
          </Field>
          <Field
            label={t('alphabeticalIndex')}
            htmlFor="alphabeticalIndex"
            required
            error={useFieldError('alphabeticalIndex')}
          >
            <Input name="alphabeticalIndex" />
          </Field>
        </div>

        <Field
          label={t('fileReference')}
          hint={tCommon('optional')}
          htmlFor="fileReference"
          error={useFieldError('fileReference')}
        >
          <Input name="fileReference" dir="ltr" className="font-mono" />
        </Field>
      </ActionForm>
    </Panel>
  )
}
