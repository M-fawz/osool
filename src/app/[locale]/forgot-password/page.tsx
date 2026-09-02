import Image from 'next/image'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { ForgotPasswordForm } from './forgot-form'

/**
 * The way back in.
 *
 * Better Auth has been able to issue reset tokens since Phase 0 — the callback
 * that mails them, the bilingual template, and the guard that refuses to
 * reinstate a suspended account through a self-service reset all existed. What
 * did not exist was any way for a person to ask for one: no link on the sign-in
 * screen, no page behind it. The translated string `signIn.forgot` sat unused
 * in both catalogues.
 *
 * On a register whose users are named government officers and the owners of
 * supervised firms, "you are locked out until an administrator intervenes" is
 * not an acceptable resting state, so this closes the loop rather than leaving
 * the capability stranded behind an API nobody can reach.
 */
export default async function ForgotPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)

  const t = await getTranslations('forgotPassword')
  const tApp = await getTranslations('app')
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
            <ForgotPasswordForm
              labels={{
                email: tSignIn('email'),
                submit: t('submit'),
                submitting: t('submitting'),
                sentTitle: t('sentTitle'),
                sentLead: t('sentLead'),
                unreachableTitle: t('unreachableTitle'),
                unreachableLead: t('unreachableLead'),
                backToSignIn: t('backToSignIn'),
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
