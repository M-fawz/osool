import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { BlockedAction, Button } from '@/components/ui/primitives'

/**
 * The page shown when something has gone wrong, and the page shown when the
 * address does not exist.
 *
 * Both go through the same four-part shape as every other refusal in this
 * system — 03-DESIGN-DIRECTION §6, and CLAUDE.md's blocked-action rule: what
 * is blocked · why, in plain language · the exact next step · who to ask.
 * "Never a bare error" has to include the errors nobody planned for, or the
 * rule only holds on the screens somebody remembered.
 *
 * The one thing an unexpected fault adds is a reference. Support cannot act on
 * "it broke", and Next already generates a digest for exactly this purpose —
 * so it is shown, selectable, rather than left in a server log the official
 * cannot reach.
 */
export async function FaultPage({
  kind,
  digest,
  action,
}: {
  kind: 'error' | 'notFound'
  digest?: string
  /** The retry control. Client-only, so the caller supplies it. */
  action?: React.ReactNode
}) {
  const [t, tBlocked, tApp] = await Promise.all([
    getTranslations('common'),
    getTranslations('blocked'),
    getTranslations('app'),
  ])

  const isError = kind === 'error'

  return (
    <div className="flex min-h-dvh flex-col bg-paper-sunk">
      <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-5 py-12">
        <BlockedAction
          what={isError ? t('errorTitle') : t('notFoundTitle')}
          why={isError ? t('errorWhy') : t('notFoundWhy')}
          nextStep={isError ? t('errorNext') : t('notFoundNext')}
          whoToAsk={isError ? t('errorWho') : t('notFoundWho')}
          headings={{
            what: tBlocked('whatHeading'),
            why: tBlocked('whyHeading'),
            next: tBlocked('nextHeading'),
            who: tBlocked('whoHeading'),
          }}
          tone={isError ? 'blocking' : 'caution'}
        />

        {digest ? (
          <p className="mt-4 text-xs text-ink-faint">
            {t('errorReference')}:{' '}
            <code className="ltr-run select-all font-mono text-ink-muted">{digest}</code>
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          {action}
          <Button asChild variant="secondary" size="touch">
            <Link href="/dashboard">{t('backToDashboard')}</Link>
          </Button>
          <Button asChild variant="ghost" size="touch">
            <Link href="/">{t('backToHome')}</Link>
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
