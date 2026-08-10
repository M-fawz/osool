import Image from 'next/image'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { ActivateForm } from './activate-form'

/**
 * Activation: the employee sets their own password from the one-time link in
 * the email the administrator's action sent.
 *
 * The token arrives as a query parameter from the email client, which is why
 * this is a page reading `searchParams` rather than anything the application
 * navigated to itself.
 */
export default async function ActivatePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ token?: string; error?: string }>
}) {
  const { locale } = await params
  const { token, error } = await searchParams
  setRequestLocale(locale)

  const t = await getTranslations('activate')
  const tApp = await getTranslations('app')
  const tBlocked = await getTranslations('blocked')
  const tSignIn = await getTranslations('signIn')

  return (
    <div className="flex min-h-dvh flex-col bg-paper-sunk">
      <main id="main" className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-10">
        <div className="mb-7 flex flex-col items-center gap-2 text-center">
          <Image src="/logo/osool-logo.png" alt="" width={168} height={168} className="h-14 w-auto" priority />
          <span className="text-md font-semibold text-navy-700">{tApp('name')}</span>
          <span className="text-2xs text-ink-faint">{tApp('register')}</span>
        </div>

        <div className="border border-rule bg-paper">
          <div className="brass-rule px-6 pb-4 pt-6">
            <h1 className="text-xl font-semibold text-navy-700">{t('title')}</h1>
            <p className="mt-1 text-base text-ink-muted">{t('lead')}</p>
          </div>
          <div className="p-6">
            <ActivateForm
              token={token ?? null}
              hadLinkError={Boolean(error)}
              labels={{
                password: t('password'),
                confirm: t('confirm'),
                hint: t('hint'),
                submit: t('submit'),
                submitting: t('submitting'),
                successTitle: t('successTitle'),
                successLead: t('successLead'),
                mismatchTitle: t('mismatchTitle'),
                mismatchWhy: t('mismatchWhy'),
                mismatchNext: t('mismatchNext'),
                mismatchWho: t('mismatchWho'),
                tooShortWhy: t('tooShortWhy'),
                tooShortNext: t('tooShortNext'),
                invalidTitle: t('invalidTitle'),
                invalidWhy: t('invalidWhy'),
                invalidNext: t('invalidNext'),
                invalidWho: t('invalidWho'),
                signIn: tSignIn('submit'),
              }}
              headings={{
                what: tBlocked('whatHeading'),
                why: tBlocked('whyHeading'),
                next: tBlocked('nextHeading'),
                who: tBlocked('whoHeading'),
              }}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
