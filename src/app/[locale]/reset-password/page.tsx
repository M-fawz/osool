import Image from 'next/image'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { ActivateForm } from '../activate/activate-form'

/**
 * Choosing a new password from a reset link.
 *
 * The mechanism is identical to activation — the same Better Auth reset token,
 * the same `authClient.resetPassword` call — so the form is the same component
 * rather than a copy of it. What differs is everything the person reads: they
 * have an account and have not forgotten it exists, so "Activate your account"
 * would be wrong, and the refusal copy for a stale link has to send them back
 * to request another one themselves rather than to an administrator.
 *
 * A separate route rather than `/activate?mode=reset` because Better Auth
 * appends `?token=…` to the callback URL it is given; a callback that already
 * carried a query string would produce two `?` in one URL.
 */
export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ token?: string; error?: string }>
}) {
  const { locale } = await params
  const { token, error } = await searchParams
  setRequestLocale(locale)

  const t = await getTranslations('resetPassword')
  const tActivate = await getTranslations('activate')
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
                // The password rules are the same rules, so they are the same
                // strings — there is one place to change "at least 12".
                password: t('password'),
                confirm: tActivate('confirm'),
                hint: tActivate('hint'),
                submit: t('submit'),
                submitting: t('submitting'),
                successTitle: t('successTitle'),
                successLead: t('successLead'),
                mismatchTitle: t('mismatchTitle'),
                mismatchWhy: tActivate('mismatchWhy'),
                mismatchNext: tActivate('mismatchNext'),
                mismatchWho: tActivate('mismatchWho'),
                tooShortWhy: tActivate('tooShortWhy'),
                tooShortNext: tActivate('tooShortNext'),
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

        <p className="mt-6 text-center text-xs leading-relaxed text-ink-faint">
          {tApp('authority')}
          <br />
          {tApp('ministry')}
        </p>
      </main>
    </div>
  )
}
