import { getRequestConfig } from 'next-intl/server'
import { hasLocale } from 'next-intl'
import { routing } from './routing'

/**
 * Per-request locale resolution.
 *
 * Falls back to Arabic — never to English — when the requested locale is
 * absent or unrecognised.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    // Latin (Western Arabic) numerals throughout, in both locales.
    // 03-DESIGN-DIRECTION §4: registration numbers, dates, and currency values
    // must be unambiguous, so the register does not use Eastern Arabic digits
    // for data even when the surrounding prose is Arabic.
    formats: {
      number: {
        egp: { style: 'currency', currency: 'EGP', currencyDisplay: 'name', maximumFractionDigits: 0 },
        plain: { useGrouping: true },
      },
      dateTime: {
        short: { year: 'numeric', month: '2-digit', day: '2-digit' },
        long: { year: 'numeric', month: 'long', day: 'numeric' },
        stamp: {
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', hour12: false,
        },
      },
    },
  }
})
