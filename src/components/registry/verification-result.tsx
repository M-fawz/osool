import Image from 'next/image'
import { getTranslations } from 'next-intl/server'
import type { Locale } from '@/i18n/routing'
import { Link } from '@/i18n/navigation'
import { ruleSet } from '@/lib/rules'
import { governorateLabels } from '@/lib/reference/governorates'
import type { VerificationResult } from '@/lib/registry/verification'
import { Button, Icon, Input, KeyValue, KeyValueItem, Notice } from '@/components/ui/primitives'
import { Ltr, Stamp } from '@/components/ui/bidi'
import { CircleSlash, FileSearch, ShieldCheck, forwardArrow } from '@/components/ui/icon'

/**
 * The answer to a public verification. REQ-REG-061.
 *
 * PRODUCT.md §: the back office is built to *operate*, and "the exception is
 * the public landing and verification pages" — a citizen standing in an estate
 * agent's office with a number on a business card is not an official working a
 * queue. So this is one enormous, unambiguous answer, legible at arm's length,
 * followed by the four facts that qualify it.
 *
 * A negative answer is drawn as heavily as a positive one. The failure mode
 * this page exists to prevent is somebody concluding "it probably just didn't
 * load" and handing over a deposit, and a grey line of small text would invite
 * exactly that.
 *
 * The category and type labels come from the rule set in force on the day the
 * registration started, not from constants and not from today's rule set —
 * CLAUDE.md rule 4, and the same choice the broker's own registration screen
 * makes. A decree that renames a category must not silently relabel
 * registrations granted under the old one.
 */
export async function VerificationResultPanel({
  result,
  locale,
}: {
  result: VerificationResult
  locale: Locale
}) {
  const [t, tHome, tApp] = await Promise.all([
    getTranslations('verify'),
    getTranslations('home'),
    getTranslations('app'),
  ])

  const verified = result.outcome === 'verified'
  const label = locale === 'ar' ? ('labelAr' as const) : ('labelEn' as const)

  const [categories, types] = verified
    ? await Promise.all([
        ruleSet<{ labelAr: string; labelEn: string }>('BROKER_CATEGORY', { asOf: result.validFrom }),
        ruleSet<{ labelAr: string; labelEn: string }>('BROKER_TYPE', { asOf: result.validFrom }),
      ])
    : [null, null]

  const firmName = verified
    ? locale === 'ar'
      ? result.tradeNameAr
      : (result.tradeNameEn ?? result.tradeNameAr)
    : null

  return (
    <div className="flex min-h-dvh flex-col bg-paper-sunk">
      <header data-chrome="" className="on-chrome border-b border-chrome-rule bg-chrome">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-2.5 px-5">
          <Link href="/" className="on-chrome flex items-center gap-2.5">
            <Image
              src="/logo/osool-logo.png"
              alt=""
              width={96}
              height={96}
              className="h-8 w-auto bg-white p-0.5"
            />
            <span className="text-md font-semibold text-chrome-text">{tApp('name')}</span>
          </Link>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-5 py-10">
        <p className="text-2xs font-semibold uppercase tracking-wider text-ink-faint">
          {t('resultFor')}
        </p>
        <p className="mt-1 text-2xl font-bold text-navy-700">
          <Ltr>{result.registrationNumber}</Ltr>
        </p>

        <div
          className={`mt-6 border ${verified ? 'border-confirmed/40 bg-confirmed-soft' : 'border-blocking/40 bg-blocking-soft'}`}
        >
          <div className="flex items-start gap-3 px-5 py-5">
            <Icon
              as={verified ? ShieldCheck : CircleSlash}
              size="lg"
              className={verified ? 'mt-0.5 text-confirmed' : 'mt-0.5 text-blocking'}
            />
            <div className="min-w-0">
              <h1
                className={`text-xl font-semibold ${verified ? 'text-confirmed' : 'text-blocking'}`}
              >
                {verified ? t('verifiedTitle') : t('unverifiedTitle')}
              </h1>
              <p className="mt-1 max-w-reading text-base text-ink-muted">
                {verified ? t('verifiedLead') : t('unverifiedLead')}
              </p>
            </div>
          </div>

          {verified ? (
            <div className="border-t border-confirmed/25 bg-paper px-5 py-5">
              <p className="text-2xs font-semibold uppercase tracking-wider text-ink-faint">
                {t('firmName')}
              </p>
              <p className="mt-1 text-lg font-semibold text-ink">{firmName}</p>

              <KeyValue className="mt-5">
                <KeyValueItem label={t('category')}>
                  {categories?.byKey.get(result.category)?.payload[label] ?? result.category}
                </KeyValueItem>
                <KeyValueItem label={t('types')}>
                  {result.types
                    .map((ty) => types?.byKey.get(ty)?.payload[label] ?? ty)
                    .join(locale === 'ar' ? '، ' : ', ')}
                </KeyValueItem>
                {result.governorate ? (
                  <KeyValueItem label={t('governorate')}>
                    {governorateLabels[result.governorate][locale]}
                  </KeyValueItem>
                ) : null}
                <KeyValueItem label={t('validFrom')}>
                  <Stamp value={result.validFrom} />
                </KeyValueItem>
                <KeyValueItem label={t('validTo')}>
                  <Stamp value={result.validTo} />
                </KeyValueItem>
              </KeyValue>
            </div>
          ) : null}
        </div>

        {/* What this answer does and does not mean. A citizen who reads
            "verified" as "the Authority vouches for this firm's conduct" has
            been misled by the screen, not by the register. */}
        <Notice tone="informational" className="mt-6">
          {verified ? t('scopeVerified') : t('scopeUnverified')}
        </Notice>

        {/* Checking a second number is by far the likeliest next thing, so it
            is a field here rather than a link back to the homepage. */}
        <form action={locale === 'ar' ? '/verify' : `/${locale}/verify`} className="mt-8 border border-rule bg-paper">
          <div className="flex items-start gap-3 border-b border-rule px-5 py-4">
            <Icon as={FileSearch} size="md" className="mt-0.5 text-brass-600" />
            <h2 className="text-md font-semibold text-navy-700">{t('checkAnother')}</h2>
          </div>
          <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <label htmlFor="registration-number" className="sr-only">
                {tHome('verifyPlaceholder')}
              </label>
              <Input
                id="registration-number"
                name="number"
                dir="ltr"
                inputMode="numeric"
                autoComplete="off"
                placeholder={tHome('verifyPlaceholder')}
                className="ltr-run text-lg"
              />
            </div>
            <Button size="touch" type="submit" className="shrink-0">
              {tHome('verifyAction')}
              <Icon as={forwardArrow(locale)} size="sm" />
            </Button>
          </div>
        </form>
      </main>

      <footer className="border-t border-rule bg-paper">
        <div className="mx-auto max-w-3xl px-5 py-5 text-xs leading-relaxed text-ink-faint">
          <p>{tApp('authority')}</p>
        </div>
      </footer>
    </div>
  )
}
