'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { startApplicationAction } from '@/app/[locale]/application/actions'
import { Button } from '@/components/ui/button'

/**
 * "Start a new application".
 *
 * The action creates the firm's record on first use and returns the id, so the
 * button is the only thing standing between a broker who has just signed up and
 * step 1. It also returns an existing draft's id rather than making a second
 * one — pressing it twice lands in the same file, not in two empty ones the
 * register can never delete.
 *
 * ── Why the busy state outlives the action ─────────────────────────────────
 *
 * It used to be cleared in a `finally`, which runs the instant `router.push` is
 * *called* — not when the next screen arrives. Measured on production: busy off
 * at 604 ms, the capacity step on screen at 1601 ms. For a whole second the
 * applicant saw an idle button on an unchanged page, and the reasonable thing
 * to do with an idle button is press it again. On a cold serverless start that
 * window is several seconds.
 *
 * Two presses on a broker's *first* application used to be genuinely
 * destructive — see `startApplicationAction`, which now takes a row lock. This
 * end of it keeps the button honest: `useTransition` holds the busy state until
 * the destination has rendered, and `busy` also disables the control, so the
 * second press cannot be made at all.
 */
export function StartApplicationButton({ label }: { label: string }) {
  const router = useRouter()
  const t = useTranslations('apply')
  const tErrors = useTranslations('errors')
  const [working, setWorking] = React.useState(false)
  const [navigating, startNavigation] = React.useTransition()
  const [failed, setFailed] = React.useState(false)

  const busy = working || navigating

  return (
    <div className="space-y-2">
      <Button
        size="touch"
        busy={busy}
        onClick={async () => {
          if (busy) return
          setWorking(true)
          setFailed(false)
          try {
            const result = await startApplicationAction()
            if (result.ok) {
              // The transition is what keeps the control busy across the
              // navigation. `setWorking(false)` is safe here only because
              // `navigating` has already taken over.
              startNavigation(() => {
                router.push(`/application/${result.applicationId}/capacity`)
              })
              setWorking(false)
              return
            }
            setFailed(true)
          } catch {
            setFailed(true)
          } finally {
            setWorking(false)
          }
        }}
      >
        {label}
      </Button>

      {/* Never a bare spinner: the control says what it is doing. */}
      <p className="text-sm text-ink-faint" aria-live="polite">
        {busy ? t('openingApplication') : null}
      </p>

      {failed ? (
        <p role="alert" className="text-sm text-blocking">
          {tErrors('unexpectedWhy')} {tErrors('unexpectedNext')}
        </p>
      ) : null}
    </div>
  )
}
