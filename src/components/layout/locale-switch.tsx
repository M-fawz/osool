'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Link, usePathname } from '@/i18n/navigation'
import type { Locale } from '@/i18n/routing'

/**
 * Changing language without losing your place.
 *
 * Both shells used to point this control at a fixed destination — the officers'
 * at `/dashboard`, the portal's at `/application`. Switching language from
 * anywhere else therefore threw away the page: an examiner reading a filtered
 * register on page 3 landed on the dashboard, and so did a broker halfway
 * through an application's document step.
 *
 * On a product whose first rule is that English is a full mirror of Arabic
 * rather than a courtesy, "you may read this in Arabic, but only from the
 * beginning" is not a mirror. The control now re-renders the page you are on in
 * the other language, filters and pagination included, which is the only
 * behaviour that makes the two languages equal.
 *
 * `usePathname` here is next-intl's, which returns the path *without* the
 * locale segment — precisely what `Link`'s `locale` prop expects.
 */
function LocaleSwitchLink({
  otherLocale,
  label,
  className,
}: {
  otherLocale: Locale
  label: string
  className: string
}) {
  const pathname = usePathname()
  const params = useSearchParams()

  const query = params.toString()
  const href = query ? `${pathname}?${query}` : pathname

  return (
    <Link
      href={href}
      locale={otherLocale}
      // `lang` matters: this is the one control on the page whose text is
      // deliberately in the *other* language, and without it a screen reader
      // pronounces "English" with Arabic phonemes.
      lang={otherLocale}
      className={className}
    >
      {label}
    </Link>
  )
}

export function LocaleSwitch(props: {
  otherLocale: Locale
  label: string
  className: string
}) {
  /*
   * `useSearchParams` opts the tree into client-side rendering at request time.
   * The boundary keeps that contained to this one link instead of letting it
   * reach the whole shell, and the fallback is the same control pointing at the
   * page without its query string — still correct, just without the filters.
   */
  return (
    <Suspense
      fallback={
        <Link
          href="/dashboard"
          locale={props.otherLocale}
          lang={props.otherLocale}
          className={props.className}
        >
          {props.label}
        </Link>
      }
    >
      <LocaleSwitchLink {...props} />
    </Suspense>
  )
}
