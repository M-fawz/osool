import { defineRouting } from 'next-intl/routing'

/**
 * Locale routing.
 *
 * Arabic is the default and it is not prefixed: `/applications` is the Arabic
 * register, `/en/applications` is its English mirror. That ordering is the
 * point — CLAUDE.md rule 7, "Arabic first, RTL first. English is a full mirror,
 * not a courtesy." A system whose canonical URLs were English with Arabic as
 * `/ar/...` would have made the opposite claim in the address bar of every
 * screen.
 */
export const routing = defineRouting({
  locales: ['ar', 'en'],
  defaultLocale: 'ar',
  localePrefix: 'as-needed',
})

export type Locale = (typeof routing.locales)[number]

/** Writing direction per locale. */
export const localeDirection: Record<Locale, 'rtl' | 'ltr'> = {
  ar: 'rtl',
  en: 'ltr',
}

export const localeLabel: Record<Locale, string> = {
  ar: 'العربية',
  en: 'English',
}
