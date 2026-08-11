import { headers } from 'next/headers'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { Locale } from '@/i18n/routing'
import { verifyRegistrationNumber } from '@/lib/registry/verification'
import { VerificationResultPanel } from '@/components/registry/verification-result'

/**
 * The canonical, shareable form of a verification. 02-SYSTEM-ARCHITECTURE §3.
 *
 * A registration number contains a slash — `2026/0001` — which is a path
 * separator, so the number arrives percent-encoded and Next hands it back
 * decoded in the param. Nothing here has to undo that; the normaliser in
 * src/lib/registry/verification.ts is the only place that reasons about the
 * shape of a number, and it is the same one the query-string route uses.
 */
export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; number: string }>
}) {
  const { locale, number } = await params
  const t = await getTranslations({ locale, namespace: 'verify' })
  return { title: `${t('pageTitle')} — ${decodeURIComponent(number)}` }
}

export default async function VerifyNumberPage({
  params,
}: {
  params: Promise<{ locale: string; number: string }>
}) {
  const { locale, number } = await params
  setRequestLocale(locale)

  const h = await headers()
  const result = await verifyRegistrationNumber(decodeURIComponent(number), {
    ipAddress: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip'),
    userAgent: h.get('user-agent'),
  })

  return <VerificationResultPanel result={result} locale={locale as Locale} />
}
