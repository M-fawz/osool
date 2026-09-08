import Image from 'next/image'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { SignInForm } from './sign-in-form'

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)

  const t = await getTranslations('signIn')
  const tApp = await getTranslations('app')
  const tBlocked = await getTranslations('blocked')

  return (
    <div className="flex min-h-dvh flex-col bg-paper-sunk">
      <main id="main" className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-10">
        <Link
          href="/"
          className="mb-7 flex flex-col items-center gap-2 self-center text-center"
        >
          <Image
            src="/logo/osool-logo.png"
            alt=""
            width={168}
            height={168}
            className="h-14 w-auto"
            priority
          />
          {/* The name in text, not only inside the logo bitmap: the raster
              wordmark is unreadable to a screen reader and blurry when the
              browser is zoomed, and this is the first screen of the product. */}
          <span className="text-md font-semibold text-navy-700">{tApp('name')}</span>
          <span className="text-2xs text-ink-faint">{tApp('register')}</span>
        </Link>

        <div className="border border-rule bg-paper">
          <div className="brass-rule px-6 pb-4 pt-6">
            <h1 className="text-xl font-semibold text-navy-700">{t('title')}</h1>
            <p className="mt-1 text-base text-ink-muted">{t('lead')}</p>
          </div>
          <div className="p-6">
            <SignInForm
              labels={{
                email: t('email'),
                password: t('password'),
                submit: t('submit'),
                submitting: t('submitting'),
                signingIn: t('signingIn'),
                failedTitle: t('failedTitle'),
                failedWhy: t('failedWhy'),
                failedNext: t('failedNext'),
                failedWho: t('failedWho'),
                suspendedTitle: t('suspendedTitle'),
                suspendedWhy: t('suspendedWhy'),
                suspendedNext: t('suspendedNext'),
                suspendedWho: t('suspendedWho'),
              }}
              headings={{
                what: tBlocked('whatHeading'),
                why: tBlocked('whyHeading'),
                next: tBlocked('nextHeading'),
                who: tBlocked('whoHeading'),
              }}
            />

            {/* The way out of a lockout. Placed under the form rather than
                beside the password field so it cannot be mistaken for part of
                the credential entry, and kept a plain link because it is a
                navigation, not the action this screen is for. */}
            <p className="mt-5 text-center text-xs text-ink-faint">
              <Link
                href="/forgot-password"
                className="underline underline-offset-2 hover:text-ink"
              >
                {t('forgot')}
              </Link>
            </p>

            {/* The way *in* for a firm that has never held an account. Kept
                below the sign-in controls and separated by a rule, because
                this screen's job is signing in and a registration link placed
                any higher competes with it — but it has to be here, since a
                broker who cannot find it has no other route into the register
                at all. */}
            <p className="mt-5 border-t border-rule pt-5 text-center text-xs text-ink-muted">
              {t('noAccount')}{' '}
              <Link
                href="/signup"
                className="font-medium text-navy-600 underline underline-offset-2 hover:text-navy-700"
              >
                {t('createAccount')}
              </Link>
            </p>
          </div>
        </div>

        <p className="mt-6 text-center text-xs leading-relaxed text-ink-faint">
          {tApp('authority')}
          <br />
          {tApp('ministry')}
        </p>
      </main>
    </div>
  )
}
