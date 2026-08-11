import Image from 'next/image'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import type { Locale } from '@/i18n/routing'
import { isGovernmentRole, personName, roleLabel } from '@/lib/auth/roles'
import type { Session } from '@/lib/auth/session'
import { AccountMenu } from './account-menu'
import { SidebarNav } from './sidebar-nav'
import { MobileNav } from './mobile-nav'
import { navSectionsFor, type ResolvedNavSection } from './nav-items'

/**
 * The back-office shell.
 *
 * Dense by design — 03-DESIGN-DIRECTION §8: "used all day, by someone who
 * knows the process better than the software does. Design it like a
 * professional tool."
 *
 * The navigation moved out of the header and into a persistent sidebar. Three
 * text links fitted along the top; the queues, registrations, inspections and
 * signals screens that follow will not, and a header that reflows into two
 * rows the week Phase 1 lands is a header that was designed for the wrong
 * product. The sidebar also gives the current section somewhere to be marked,
 * which the header nav never had — there was no active state at all.
 *
 * Everything positional uses logical properties, so the entire chrome mirrors
 * for English without a second stylesheet: the sidebar sits on the right in
 * Arabic and the left in English because it is first in the source order, not
 * because anything measures the direction.
 */
export async function Shell({
  locale,
  session,
  children,
}: {
  locale: Locale
  session: Session
  children: React.ReactNode
}) {
  const t = await getTranslations('nav')
  const tApp = await getTranslations('app')
  const labels = roleLabel(session.role)
  const otherLocale: Locale = locale === 'ar' ? 'en' : 'ar'

  const sections: ResolvedNavSection[] = navSectionsFor(session.role).map((section) => ({
    heading: section.headingKey ? t(section.headingKey) : null,
    items: section.items.map((item) => ({
      href: item.href,
      label: t(item.labelKey),
      icon: item.icon,
    })),
  }))

  const who = personName(session, locale)
  const identity = (
    <IdentityCard
      name={who.primary}
      secondary={who.secondary}
      role={locale === 'ar' ? labels.ar : labels.en}
    />
  )

  return (
    <div className="min-h-dvh bg-paper-sunk">
      <header
        data-chrome=""
        className="on-chrome sticky top-0 z-40 border-b border-chrome-rule bg-chrome"
      >
        <div className="flex h-14 items-center gap-3 px-4">
          <MobileNav
            sections={sections}
            label={t('menu')}
            closeLabel={t('closeMenu')}
            footer={identity}
          />

          <Link href="/dashboard" className="on-chrome flex items-center gap-2.5 rounded-xs">
            <Image
              src="/logo/osool-logo.png"
              alt=""
              width={108}
              height={108}
              className="h-9 w-auto bg-white p-0.5"
              priority
            />
            <span className="flex flex-col leading-tight">
              <span className="text-md font-semibold text-chrome-text">{tApp('name')}</span>
              <span className="hidden text-2xs text-chrome-muted sm:block">
                {tApp('register')}
              </span>
            </span>
          </Link>

          <div className="ms-auto flex items-center gap-2">
            <Link
              href="/dashboard"
              locale={otherLocale}
              lang={otherLocale}
              // `lang` on the link matters: it is the one control on the page
              // whose text is deliberately in the *other* language, and
              // without it a screen reader pronounces "English" with Arabic
              // phonemes.
              className="on-chrome flex min-h-9 items-center rounded-xs border border-chrome-rule px-2.5 text-xs text-chrome-muted hover:bg-chrome-hover hover:text-chrome-text"
            >
              {t('switchToEnglish')}
            </Link>
            <AccountMenu
              identity={{
                name: who.primary,
                secondary: who.secondary,
                email: session.email,
                role: locale === 'ar' ? labels.ar : labels.en,
                organisation: tApp('authority'),
                organisationLabel: t('accountOrganisation'),
                government: isGovernmentRole(session.role),
              }}
              labels={{
                account: t('account'),
                signedInAs: t('signedInAs'),
                role: t('accountRole'),
                email: t('accountEmail'),
                organisation: t('accountOrganisation'),
                signOut: t('signOut'),
              }}
            />
          </div>
        </div>
      </header>

      <div className="flex">
        <aside
          data-chrome=""
          className="on-chrome sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-60 shrink-0 flex-col border-e border-chrome-rule bg-chrome-deep lg:flex"
        >
          <nav aria-label={t('sections')} className="flex-1 overflow-y-auto p-3">
            <SidebarNav sections={sections} />
          </nav>
          <div className="border-t border-chrome-rule p-3">{identity}</div>
        </aside>

        <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6">
          <div className="mx-auto max-w-shell">{children}</div>
        </main>
      </div>
    </div>
  )
}

/**
 * Who is signed in, and as what.
 *
 * The role is not a courtesy line. Every screen in this product shows a
 * different subset of the register depending on it, and an official who has
 * forgotten which account they are in will misread what they are looking at —
 * so it sits under the name permanently rather than inside a menu.
 */
function IdentityCard({
  name,
  secondary,
  role,
}: {
  name: string
  secondary: string | null
  role: string
}) {
  return (
    // No avatar. A circle with a letter in it is the reflex here, and it would
    // be the only round thing in a system whose radius tops out at 4px — and
    // it carries no information the two lines of text do not already carry.
    <div className="min-w-0">
      <bdi dir="auto" className="block truncate text-sm font-medium text-chrome-text" title={name}>
        {name}
      </bdi>
      {secondary ? (
        <bdi dir="auto" className="block truncate text-2xs text-chrome-faint" title={secondary}>
          {secondary}
        </bdi>
      ) : null}
      <p className="mt-1 truncate text-xs text-chrome-muted">{role}</p>
    </div>
  )
}
