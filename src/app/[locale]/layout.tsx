import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { hasLocale, NextIntlClientProvider } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { localeDirection, routing, type Locale } from '@/i18n/routing'
import '../globals.css'

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'app' })
  return {
    title: { default: `${t('name')} — ${t('register')}`, template: `%s · ${t('name')}` },
    description: t('register'),
    icons: { icon: '/logo/osool-logo.png' },
  }
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()

  setRequestLocale(locale)
  const direction = localeDirection[locale as Locale]
  const t = await getTranslations({ locale, namespace: 'nav' })

  return (
    <html lang={locale} dir={direction} suppressHydrationWarning>
      <body>
        {/* Keyboard operation of the back office is a requirement, not a
            nicety — 03-DESIGN-DIRECTION §7. The skip link is the first stop. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:bg-navy-600 focus:px-4 focus:py-2 focus:text-white"
        >
          {t('skipToContent')}
        </a>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  )
}
