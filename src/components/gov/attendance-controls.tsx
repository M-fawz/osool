'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { Button, Spinner } from '@/components/ui/button'
import { RefusalNotice } from '@/components/forms/refusal-notice'
import { UnconfirmedNotice } from '@/components/forms/unconfirmed-notice'
import { guardAction } from '@/lib/actions/unconfirmed'
import { recordAttendanceAction } from '@/app/[locale]/appointments/actions'

const record = guardAction(recordAttendanceAction)

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
 *
 * The answer is read, not assumed. A refusal is drawn under the buttons, and so
 * is a request that never came back: an error thrown inside an async
 * transition goes to the route error boundary, and a dropped connection at the
 * counter used to take the whole appointments list down with it.
 */
export function AttendanceControls({ appointmentId }: { appointmentId: string }) {
  const t = useTranslations('appointments')
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [busy, setBusy] = React.useState<'yes' | 'no' | null>(null)
  const [outcome, setOutcome] = React.useState<Awaited<ReturnType<typeof record>> | null>(null)

  const mark = (attended: 'yes' | 'no') => {
    setBusy(attended)
    setOutcome(null)
    const formData = new FormData()
    formData.set('appointmentId', appointmentId)
    formData.set('attended', attended)

    startTransition(async () => {
      const result = await record(null, formData)
      setOutcome(result)
      // The row's status is server-rendered, so a refresh is what shows the
      // change. Kept inside the transition so the button stays busy until the
      // new markup has actually arrived. Not after a connection failure: the
      // refresh would fail the same way.
      if (result.ok || result.kind !== 'unconfirmed') router.refresh()
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
        onClick={() => mark('yes')}
      >
        {busy === 'yes' ? <Spinner className="me-1.5" /> : null}
        {t('markAttended')}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => mark('no')}
      >
        {busy === 'no' ? <Spinner className="me-1.5" /> : null}
        {t('markMissed')}
      </Button>

      {outcome && !outcome.ok && outcome.kind === 'refused' ? (
        <RefusalNotice violation={outcome.violation} className="mt-2 basis-full" />
      ) : null}
      {outcome && !outcome.ok && outcome.kind === 'unconfirmed' ? (
        <UnconfirmedNotice outcome={outcome} className="mt-2 basis-full" />
      ) : null}
    </div>
  )
}
