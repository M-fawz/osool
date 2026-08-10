import Image from 'next/image'
import { getTranslations } from 'next-intl/server'
import { Link, redirect } from '@/i18n/navigation'
import type { Locale } from '@/i18n/routing'
import { roleLabel } from '@/lib/auth/roles'
import type { GuardResult } from '@/lib/auth/guard'
import { BlockedAction, Button } from '@/components/ui/primitives'

/**
 * The refusal page.
 *
 * Renders the four-part shape from 03-DESIGN-DIRECTION §6 — what is blocked,
 * why with the rule named plainly, the exact next step, who to ask — instead of
 * a 403 or a stack trace. It also deliberately does not say what the screen
 * would have contained, since the existence and shape of case data is itself
 * something an unauthorised role should not learn.
 *
 * It renders without the application shell on purpose. The shell's sidebar
 * lists the sections this role *can* reach, and putting that beside a refusal
 * turns "you may not see this" into a lucky guess about what else exists.
 */
export async function AccessRefused({
  result,
  locale,
}: {
  result: Extract<GuardResult, { ok: false }>
  locale: Locale
}) {
  const [t, tSignIn, tBlocked, tApp, tNav] = await Promise.all([
    getTranslations('common'),
    getTranslations('signIn'),
    getTranslations('blocked'),
    getTranslations('app'),
    getTranslations('nav'),
  ])

  if (result.kind === 'unauthenticated') {
    redirect({ href: '/login', locale })
  }

  const headings = {
    what: tBlocked('whatHeading'),
    why: tBlocked('whyHeading'),
    next: tBlocked('nextHeading'),
    who: tBlocked('whoHeading'),
  }

  const suspended = result.kind === 'suspended'
  const roleName =
    result.kind === 'forbidden'
      ? locale === 'ar'
        ? roleLabel(result.role).ar
        : roleLabel(result.role).en
      : ''

  return (
    <div className="flex min-h-dvh flex-col bg-paper-sunk">
      <header data-chrome="" className="on-chrome border-b border-chrome-rule bg-chrome">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-2.5 px-5">
          <Image
            src="/logo/osool-logo.png"
            alt=""
            width={96}
            height={96}
            className="h-8 w-auto bg-white p-0.5"
          />
          <span className="text-md font-semibold text-chrome-text">{tApp('name')}</span>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-5 py-12">
        {/* No page heading above this. The refusal already opens by stating
            what is blocked, and repeating that sentence as a title says the
            same thing twice in two type sizes — the "everything equal, no
            hierarchy" tell from 03-DESIGN-DIRECTION §3. The refusal is the
            page. */}
        <BlockedAction
          what={suspended ? tSignIn('suspendedTitle') : t('notAuthorisedTitle')}
          why={
            suspended
              ? result.reason
                ? `${tSignIn('suspendedWhy')} — ${result.reason}`
                : tSignIn('suspendedWhy')
              : t('notAuthorisedWhy', { role: roleName })
          }
          nextStep={suspended ? tSignIn('suspendedNext') : t('notAuthorisedNext')}
          whoToAsk={suspended ? tSignIn('suspendedWho') : t('notAuthorisedWho')}
          headings={headings}
        />

        <div className="mt-6 flex flex-wrap gap-3">
          {!suspended ? (
            <Button asChild variant="secondary" size="touch">
              <Link href="/dashboard">{t('backToDashboard')}</Link>
            </Button>
          ) : null}
          <Button asChild variant="ghost" size="touch">
            <Link href="/">{tNav('home')}</Link>
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
