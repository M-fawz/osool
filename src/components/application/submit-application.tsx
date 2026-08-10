'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import {
  submitApplicationAction,
  withdrawApplicationAction,
} from '@/app/[locale]/application/actions'
import { Button } from '@/components/ui/button'
import { ActionForm } from '@/components/forms/action-form'

/**
 * The last act.
 *
 * The button is offered even when the application is incomplete, and pressing
 * it produces the server's refusal listing exactly what is missing. Disabling
 * it would be the more obvious design and the worse one: a control that cannot
 * be pressed and does not say why is the single most common dead end in a
 * government form, and here the "why" is a list the applicant needs anyway.
 *
 * Withdrawal sits behind a confirmation and says plainly that nothing is
 * deleted — because in this register nothing is, and an applicant who believes
 * otherwise is being misled about what they are agreeing to.
 */
export function SubmitApplication({
  applicationId,
  canSubmit,
  isResubmission,
}: {
  applicationId: string
  canSubmit: boolean
  isResubmission: boolean
}) {
  const t = useTranslations('apply')
  const tCommon = useTranslations('common')
  const [confirmingWithdrawal, setConfirmingWithdrawal] = React.useState(false)

  return (
    <div className="space-y-4 border-t border-rule pt-6">
      <ActionForm
        action={submitApplicationAction}
        applicationId={applicationId}
        submitLabel={isResubmission ? t('resubmit') : t('submit')}
        secondary={
          confirmingWithdrawal ? null : (
            <Button
              type="button"
              size="touch"
              variant="ghost"
              onClick={() => setConfirmingWithdrawal(true)}
            >
              {t('withdraw')}
            </Button>
          )
        }
      >
        {canSubmit ? null : (
          // Said before the press, not only after it. The refusal that follows
          // is the complete list; this is the warning that there will be one.
          <p className="text-sm text-ink-muted">{t('reviewGapsTitle')}</p>
        )}
      </ActionForm>

      {confirmingWithdrawal ? (
        <div className="space-y-3 border border-caution/30 bg-caution-soft px-4 py-3">
          <p className="text-sm text-ink">{t('withdrawConfirm')}</p>
          <div className="flex flex-wrap items-center gap-3">
            <ActionForm
              action={withdrawApplicationAction}
              applicationId={applicationId}
              submitLabel={t('withdraw')}
              className="!space-y-0"
              showAutoSaveNote={false}
            >
              <span />
            </ActionForm>
            <Button
              type="button"
              size="touch"
              variant="ghost"
              onClick={() => setConfirmingWithdrawal(false)}
            >
              {tCommon('cancel')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
