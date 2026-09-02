'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { Button, Spinner } from '@/components/ui/button'
import { recordAttendanceAction } from '@/app/[locale]/appointments/actions'

/**
 * Marking somebody present, at the counter.
 *
 * Two plain buttons rather than the `ActionForm` the rest of the back office
 * uses, and the reason is the setting: a clerk with a queue in front of them
 * marks eight people in a minute, and a form that navigates away after each one
 * loses their place in the list every time. These post, refresh the row, and
 * leave the clerk exactly where they were.
 *
 * There is no confirmation step. Recording attendance is a fact, both values
 * are one click apart, and a mistaken mark is corrected by an officer with the
 * audit trail showing both entries — which is a better record than a dialogue
 * that makes the common case slower.
 */
export function AttendanceControls({ appointmentId }: { appointmentId: string }) {
  const t = useTranslations('appointments')
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [busy, setBusy] = React.useState<'yes' | 'no' | null>(null)

  const record = (attended: 'yes' | 'no') => {
    setBusy(attended)
    const formData = new FormData()
    formData.set('appointmentId', appointmentId)
    formData.set('attended', attended)

    startTransition(async () => {
      await recordAttendanceAction(null, formData)
      // The row's status is server-rendered, so a refresh is what shows the
      // change. Kept inside the transition so the button stays busy until the
      // new markup has actually arrived.
      router.refresh()
      setBusy(null)
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() => record('yes')}
      >
        {busy === 'yes' ? <Spinner className="me-1.5" /> : null}
        {t('markAttended')}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => record('no')}
      >
        {busy === 'no' ? <Spinner className="me-1.5" /> : null}
        {t('markMissed')}
      </Button>
    </div>
  )
}
