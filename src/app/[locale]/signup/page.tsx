import Image from 'next/image'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { governorateLabels } from '@/lib/reference/governorates'
import type { Locale } from '@/i18n/routing'
import { SignUpForm } from './signup-form'

/**
 * Where a brokerage firm gets an account.
 *
 * The supervised population is in the tens of thousands and must be able to
 * onboard without contacting the Authority (00-VISION §3), so this screen is
 * public and needs no session. It creates the firm and its owner together,
 * because a broker account with no firm attached cannot do anything at all —
 * every screen in the portal is scoped by `brokerEntityId`.
 *
 * The firm's details come first and the person's second. That is the order the
 * applicant is thinking in: they are registering a business, and they are the
 * owner of it. It also puts the two Arabic fields that matter most — the trade
 * name and the owner's name — at the top of each group.
 */
export default async function SignUpPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)

  const loc = locale as Locale
  const t = await getTranslations('signUp')
  const tApp = await getTranslations('app')

  return (
    <div className="flex min-h-dvh flex-col bg-paper-sunk">
      <main
        id="main"
        className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-10"
      >
        <Link href="/" className="mb-7 flex flex-col items-center gap-2 self-center text-center">
          <Image
            src="/logo/osool-logo.png"
            alt=""
            width={168}
            height={168}
            className="h-14 w-auto"
            priority
          />
          <span className="text-md font-semibold text-navy-700">{tApp('name')}</span>
          <span className="text-2xs text-ink-faint">{tApp('register')}</span>
        </Link>

        <div className="border border-rule bg-paper">
          <div className="brass-rule px-6 pb-4 pt-6">
            <h1 className="text-xl font-semibold text-navy-700">{t('title')}</h1>
            <p className="mt-1 text-base text-ink-muted">{t('lead')}</p>
          </div>
          <div className="p-6">
            <SignUpForm
              governorates={Object.entries(governorateLabels).map(([value, label]) => ({
                value,
                label: loc === 'ar' ? label.ar : label.en,
              }))}
              labels={{
                firmLegend: t('firmLegend'),
                ownerLegend: t('ownerLegend'),
                tradeNameAr: t('tradeNameAr'),
                tradeNameEn: t('tradeNameEn'),
                governorate: t('governorate'),
                governoratePlaceholder: t('governoratePlaceholder'),
                headOfficeAddress: t('headOfficeAddress'),
                ownerNameAr: t('ownerNameAr'),
                ownerNameEn: t('ownerNameEn'),
                email: t('email'),
                emailHint: t('emailHint'),
                password: t('password'),
                passwordHint: t('passwordHint'),
                submit: t('submit'),
                submitting: t('submitting'),
                sentTitle: t('sentTitle'),
                sentLead: t('sentLead'),
                devLinkTitle: t('devLinkTitle'),
                devLinkLead: t('devLinkLead'),
                refusedTitle: t('refusedTitle'),
                refusedLead: t('refusedLead'),
                haveAccount: t('haveAccount'),
                backToSignIn: t('backToSignIn'),
                forgot: t('forgot'),
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
