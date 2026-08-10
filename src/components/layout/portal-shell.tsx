import Image from 'next/image'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import type { Locale } from '@/i18n/routing'
import type { Session } from '@/lib/auth/session'
import { SignOutButton } from './sign-out-button'

/**
 * The broker portal's chrome.
 *
 * Deliberately not the back-office `Shell`. 03-DESIGN-DIRECTION §8 asks for two
 * different applications of one design system, and the difference is not
 * decoration: an examiner needs the queue permanently visible in a sidebar,
 * while a broker filling in a form on a phone needs the screen to contain the
 * one thing they are doing. A 240px sidebar of sections a broker will never
 * open would take a third of a 390px screen to say nothing.
 *
 * So: the same navy chrome, the same brass rule, the same type — and a single
 * column at a reading measure, with no navigation competing with the form.
 * There is one link out, and it goes back to the list of applications.
 */
export async function PortalShell({
  locale,
  session,
  children,
  /** Shown under the wordmark: which firm this is. */
  firmName,
  /** A back link, when the page is inside a flow rather than at its top. */
  backHref,
  backLabel,
}: {
  locale: Locale
  session: Session
  children: React.ReactNode
  firmName?: string | null
  backHref?: string
  backLabel?: string
}) {
  const t = await getTranslations('nav')
  const tApp = await getTranslations('app')
  const otherLocale: Locale = locale === 'ar' ? 'en' : 'ar'

  return (
    <div className="flex min-h-dvh flex-col bg-paper-sunk">
      <header
        data-chrome=""
        className="on-chrome sticky top-0 z-40 border-b border-chrome-rule bg-chrome"
      >
        <div className="mx-auto flex h-14 w-full max-w-4xl items-center gap-3 px-4">
          <Link
            href="/application"
            className="on-chrome flex min-h-11 min-w-0 items-center gap-2.5 rounded-xs"
          >
            <Image
              src="/logo/osool-logo.png"
              alt=""
              width={108}
              height={108}
              className="h-9 w-auto bg-white p-0.5"
              priority
            />
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="text-md font-semibold text-chrome-text">{tApp('name')}</span>
              <bdi className="hidden truncate text-2xs text-chrome-muted sm:block">
                {firmName ?? tApp('register')}
              </bdi>
            </span>
          </Link>

          <div className="ms-auto flex items-center gap-2">
            <Link
              href="/application"
              locale={otherLocale}
              lang={otherLocale}
              className="on-chrome flex min-h-11 items-center rounded-xs border border-chrome-rule px-3 text-sm text-chrome-muted hover:bg-chrome-hover hover:text-chrome-text"
            >
              {t('switchToEnglish')}
            </Link>
            <SignOutButton label={t('signOut')} size="touch" />
          </div>
        </div>
      </header>

      {backHref && backLabel ? (
        <div className="border-b border-rule bg-paper">
          <div className="mx-auto w-full max-w-4xl px-4">
            <Link
              href={backHref}
              className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-navy-600 hover:underline"
            >
              {backLabel}
            </Link>
          </div>
        </div>
      ) : null}

      {/* max-w-4xl rather than the back office's 1560px. A form read on a phone
          and a form read on a desk monitor should be the same width of text;
          the desk simply gets more margin. */}
      <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>

      <footer className="mt-auto border-t border-rule bg-paper">
        <div className="mx-auto w-full max-w-4xl px-4 py-4 text-2xs leading-relaxed text-ink-faint sm:px-6">
          <p>{tApp('authority')}</p>
          <p>{tApp('ministry')}</p>
        </div>
      </footer>
    </div>
  )
}
