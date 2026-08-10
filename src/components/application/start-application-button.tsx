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
 */
export function StartApplicationButton({ label }: { label: string }) {
  const router = useRouter()
  const tErrors = useTranslations('errors')
  const [busy, setBusy] = React.useState(false)
  const [failed, setFailed] = React.useState(false)

  return (
    <div className="space-y-2">
      <Button
        size="touch"
        busy={busy}
        onClick={async () => {
          setBusy(true)
          setFailed(false)
          try {
            const result = await startApplicationAction()
            if (result.ok) {
              router.push(`/application/${result.applicationId}/capacity`)
              return
            }
            setFailed(true)
          } catch {
            setFailed(true)
          } finally {
            setBusy(false)
          }
        }}
      >
        {label}
      </Button>

      {failed ? (
        <p role="alert" className="text-sm text-blocking">
          {tErrors('unexpectedWhy')} {tErrors('unexpectedNext')}
        </p>
      ) : null}
    </div>
  )
}
