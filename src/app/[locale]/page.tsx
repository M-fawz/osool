import Image from 'next/image'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import type { Locale } from '@/i18n/routing'
import { Button, Icon, Input } from '@/components/ui/primitives'
import { FileSearch, ShieldCheck, forwardArrow } from '@/components/ui/icon'

/**
 * The public landing page.
 *
 * The one place in this product that is not `operate` — 03-DESIGN-DIRECTION §1
 * puts the public landing and verification pages in `persuade` and `read`,
 * because an unfamiliar citizen has to trust the register and find what they
 * need in one screen. So this page is allowed air that the back office is not.
 *
 * It is deliberately not a marketing page. There is one thing a citizen came
 * here to do — check whether a broker is genuinely registered — and it is the
 * largest, highest thing on the screen. Officials signing in are the secondary
 * audience and get a line, not a competing panel of equal weight.
 *
 * Verification itself lands in Phase 2; the field is here because it is the
 * first thing a citizen arrives looking for, and a landing page that hid it
 * would be the wrong shape to grow into.
 */
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)

  const [t, tApp, tNav] = await Promise.all([
    getTranslations('home'),
    getTranslations('app'),
    getTranslations('nav'),
  ])
  const loc = locale as Locale
  const other: Locale = loc === 'ar' ? 'en' : 'ar'

  return (
    <div className="flex min-h-dvh flex-col bg-paper-sunk">
      <header data-chrome="" className="on-chrome border-b border-chrome-rule bg-chrome">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-5">
          <Link href="/" className="on-chrome flex items-center gap-2.5 rounded-xs">
            <Image
              src="/logo/osool-logo.png"
              alt=""
              width={108}
              height={108}
              className="h-9 w-auto bg-white p-0.5"
              priority
            />
            <span className="flex flex-col leading-tight">
              <span className="text-md font-semibold text-chrome-text">{tApp('name')}</span>
              <span className="hidden text-2xs text-chrome-muted sm:block">
                {tApp('register')}
              </span>
            </span>
          </Link>

          <div className="ms-auto flex items-center gap-2">
            <Link
              href="/"
              locale={other}
              lang={other}
              className="on-chrome flex min-h-9 items-center rounded-xs border border-chrome-rule px-2.5 text-xs text-chrome-muted hover:bg-chrome-hover hover:text-chrome-text"
            >
              {tNav('switchToEnglish')}
            </Link>
            <Link
              href="/login"
              className="on-chrome flex min-h-9 items-center rounded-xs bg-white px-3 text-sm font-medium text-navy-700 hover:bg-navy-50"
            >
              {tNav('signIn')}
            </Link>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-5 py-10 sm:py-14">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-semibold leading-tight text-navy-700">{t('title')}</h1>
          <div className="brass-rule my-4 w-24" />
          <p className="max-w-reading text-lg leading-relaxed text-ink-muted">{t('lead')}</p>
        </div>

        {/* The one task. Given the weight the task deserves. */}
        <section
          className="mt-10 border border-rule bg-paper"
          aria-labelledby="verify-heading"
        >
          <div className="flex items-start gap-3 border-b border-rule px-5 py-4">
            <Icon as={FileSearch} size="md" className="mt-0.5 text-brass-600" />
            <div>
              <h2 id="verify-heading" className="text-xl font-semibold text-navy-700">
                {t('verifyHeading')}
              </h2>
              <p className="mt-1 max-w-reading text-base text-ink-muted">{t('verifyLead')}</p>
            </div>
          </div>

          <form action="/verify" className="flex flex-col gap-3 p-5 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <label htmlFor="registration-number" className="sr-only">
                {t('verifyPlaceholder')}
              </label>
              <Input
                id="registration-number"
                name="number"
                dir="ltr"
                inputMode="numeric"
                autoComplete="off"
                placeholder={t('verifyPlaceholder')}
                className="ltr-run text-lg"
              />
            </div>
            <Button size="touch" type="submit" className="shrink-0">
              {t('verifyAction')}
              <Icon as={forwardArrow(loc)} size="sm" />
            </Button>
          </form>
        </section>

        {/* Secondary. A line and a link, not a second panel of equal size —
            §3 names "everything equal, no hierarchy" as the tell. */}
        <section className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-1.5" aria-labelledby="signin-heading">
          <Icon as={ShieldCheck} size="sm" className="text-ink-faint" />
          <h2 id="signin-heading" className="text-base font-medium text-ink">
            {t('signInHeading')}
          </h2>
          <p className="text-base text-ink-muted">{t('signInLead')}</p>
          <Link
            href="/login"
            className="text-base font-medium text-navy-600 underline underline-offset-4 hover:text-navy-700"
          >
            {tNav('signIn')}
          </Link>
        </section>
      </main>

      <footer className="border-t border-rule bg-paper">
        <div className="mx-auto max-w-5xl px-5 py-6 text-xs leading-relaxed text-ink-faint">
          <p>{tApp('authority')}</p>
          <p>{tApp('ministry')}</p>
        </div>
      </footer>
    </div>
  )
}
