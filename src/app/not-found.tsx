import { cookies } from 'next/headers'
import ar from '../../messages/ar.json'
import en from '../../messages/en.json'
import { localeDirection, routing, type Locale } from '@/i18n/routing'
import { BlockedAction } from '@/components/ui/primitives'
import './globals.css'

/**
 * The 404 for an address that matched no route at all.
 *
 * This has to live at the application root, not under `[locale]`. A
 * `not-found.tsx` inside a dynamic segment only catches `notFound()` thrown by
 * pages *within* that segment; a URL that matches no route falls all the way
 * through to here. Without this file Next serves its own built-in 404 — a
 * centred `404 | This page could not be found.` in system-ui, in English, with
 * no Arabic, no chrome, and none of the four parts every refusal in this
 * product is required to state. It was the one bare error left in the system.
 *
 * Two things are unusual about it, both forced by where it sits.
 *
 * It renders its own `<html>`, because the root layout is a pass-through and
 * the element carrying `lang` and `dir` normally lives under `[locale]` — a
 * segment this request never reached.
 *
 * And it reads the message catalogues directly rather than through next-intl.
 * There is no resolved locale here to hang a request config on, so the
 * language comes from the `NEXT_LOCALE` cookie the middleware sets, and falls
 * back to Arabic — which is the register's own language, and the right default
 * for a citizen who has mistyped a link.
 */
/**
 * Bilingual and static, because `not-found` is not a route and cannot resolve
 * the locale in `generateMetadata`. A browser tab reading
 * `localhost:3000/does-not-exist` is not a title.
 */
export const metadata = {
  title: 'الصفحة غير موجودة · Page not found — أصول',
}

export default async function RootNotFound() {
  const store = await cookies()
  const cookieLocale = store.get('NEXT_LOCALE')?.value
  const locale: Locale = routing.locales.includes(cookieLocale as Locale)
    ? (cookieLocale as Locale)
    : routing.defaultLocale

  const m = locale === 'en' ? en : ar
  const dir = localeDirection[locale]

  return (
    <html lang={locale} dir={dir}>
      <body>
        <div className="flex min-h-dvh flex-col bg-paper-sunk">
          <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-5 py-12">
            <BlockedAction
              what={m.common.notFoundTitle}
              why={m.common.notFoundWhy}
              nextStep={m.common.notFoundNext}
              whoToAsk={m.common.notFoundWho}
              headings={{
                what: m.blocked.whatHeading,
                why: m.blocked.whyHeading,
                next: m.blocked.nextHeading,
                who: m.blocked.whoHeading,
              }}
              tone="caution"
            />

            <div className="mt-6 flex flex-wrap gap-3">
              {/* Plain anchors, not the locale-aware Link: that helper needs
                  the routing context this segment never established. The href
                  is built from the locale instead. */}
              <a
                href={locale === routing.defaultLocale ? '/' : `/${locale}`}
                className="inline-flex min-h-11 items-center rounded-xs border border-rule-strong bg-paper px-5 text-md font-medium text-ink hover:border-navy-300 hover:bg-navy-50"
              >
                {m.common.backToHome}
              </a>
              <a
                href={locale === routing.defaultLocale ? '/dashboard' : `/${locale}/dashboard`}
                className="inline-flex min-h-11 items-center rounded-xs px-5 text-md font-medium text-navy-600 hover:bg-navy-50"
              >
                {m.common.backToDashboard}
              </a>
            </div>
          </main>

          <footer className="border-t border-rule bg-paper">
            <div className="mx-auto max-w-2xl px-5 py-5 text-xs leading-relaxed text-ink-faint">
              <p>{m.app.authority}</p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  )
}
