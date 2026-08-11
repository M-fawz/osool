import { headers } from 'next/headers'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { redirect } from '@/i18n/navigation'
import type { Locale } from '@/i18n/routing'
import { verifyRegistrationNumber } from '@/lib/registry/verification'
import { VerificationResultPanel } from '@/components/registry/verification-result'

/**
 * Public broker verification. REQ-REG-061 — 02-SYSTEM-ARCHITECTURE §3 lists
 * this route as `verify/[number]`, and both spellings resolve here: the
 * homepage submits a plain GET form, which produces `?number=…`, and the
 * canonical path form is what someone shares or bookmarks.
 *
 * No session, no guard. This is the one screen in the product a member of the
 * public is supposed to reach, and requiring an account to check whether a
 * broker is registered would defeat the purpose of publishing a register.
 *
 * Dynamic rather than prerendered, because it reads the caller's address for
 * the audit trail. That is deliberate: 00-VISION §5 computes integrity signals
 * from read patterns, and a cached verification page produces none.
 */
export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'verify' })
  return { title: t('pageTitle') }
}

export default async function VerifyPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ number?: string }>
}) {
  const { locale } = await params
  const { number } = await searchParams
  setRequestLocale(locale)

  // An empty submission is not a failed verification, and drawing it as one
  // would tell a citizen who mistyped nothing at all that a broker is
  // unregistered. Send them back to the field.
  const submitted = number?.trim() ?? ''
  if (!submitted) {
    redirect({ href: '/', locale: locale as Locale })
  }

  const h = await headers()
  const result = await verifyRegistrationNumber(submitted, {
    ipAddress: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip'),
    userAgent: h.get('user-agent'),
  })

  return <VerificationResultPanel result={result} locale={locale as Locale} />
}
