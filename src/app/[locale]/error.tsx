'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { BlockedAction, Button } from '@/components/ui/primitives'

/**
 * The unexpected-fault boundary.
 *
 * CLAUDE.md's blocked-action rule says every refusal states what is blocked,
 * why, the next step, and who to ask — "never a bare error". That has to
 * include the errors nobody planned for, otherwise the rule only holds on the
 * screens somebody remembered to write copy for. So a crash renders the same
 * four-part notice as a rejected application does.
 *
 * The digest is Next's own reference for the server-side stack trace. It is
 * shown, selectable, because support cannot act on "it broke" and the official
 * looking at this screen has no access to the server log.
 *
 * What it does not say is what went wrong. The message could name a table, a
 * column, or a case, and an unhandled error is exactly the moment not to leak
 * the shape of the register to whoever triggered it.
 */
export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations('common')
  const tBlocked = useTranslations('blocked')
  const tApp = useTranslations('app')

  useEffect(() => {
    console.error('[osool] unhandled route error', error)
  }, [error])

  return (
    <div className="flex min-h-dvh flex-col bg-paper-sunk">
      <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-5 py-12">
        <BlockedAction
          what={t('errorTitle')}
          why={t('errorWhy')}
          nextStep={t('errorNext')}
          whoToAsk={t('errorWho')}
          headings={{
            what: tBlocked('whatHeading'),
            why: tBlocked('whyHeading'),
            next: tBlocked('nextHeading'),
            who: tBlocked('whoHeading'),
          }}
        />

        {error.digest ? (
          <p className="mt-4 text-xs text-ink-faint">
            {t('errorReference')}:{' '}
            <code className="ltr-run select-all font-mono text-ink-muted">{error.digest}</code>
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <Button size="touch" onClick={reset}>
            {t('retry')}
          </Button>
          <Button asChild variant="secondary" size="touch">
            <Link href="/dashboard">{t('backToDashboard')}</Link>
          </Button>
        </div>
      </main>

      <footer className="border-t border-rule bg-paper">
        <div className="mx-auto max-w-2xl px-5 py-5 text-xs leading-relaxed text-ink-faint">
          <p>{tApp('authority')}</p>
        </div>
      </footer>
    </div>
  )
}
