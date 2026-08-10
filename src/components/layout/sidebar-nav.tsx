'use client'

import { Link, usePathname } from '@/i18n/navigation'
import { cn } from '@/lib/cn'
import { Icon } from '@/components/ui/icon'
import { NAV_ICONS, type ResolvedNavSection } from './nav-items'

/**
 * The navigation list, shared by the sidebar and the mobile drawer.
 *
 * A client component for exactly one reason: `aria-current="page"`. Marking
 * the active entry needs the current path, and getting it any other way — a
 * prop threaded through every page — is a thing somebody eventually forgets to
 * pass, at which point a screen-reader user loses their place in the product
 * and nobody notices because it still looks right.
 *
 * `usePathname` here is next-intl's, which returns the path with the locale
 * prefix already stripped, so `/en/audit` and `/audit` both match `/audit`.
 */
export function SidebarNav({
  sections,
  onNavigate,
  className,
}: {
  sections: ResolvedNavSection[]
  /** Closes the drawer on a phone once a destination has been chosen. */
  onNavigate?: () => void
  className?: string
}) {
  const pathname = usePathname()

  return (
    <div className={cn('flex flex-col gap-5', className)}>
      {sections.map((section, index) => (
        <div key={section.heading ?? `group-${index}`}>
          {section.heading ? (
            <p className="mb-1.5 px-3 text-2xs font-semibold uppercase tracking-wider text-chrome-faint">
              {section.heading}
            </p>
          ) : null}

          <ul className="space-y-0.5">
            {section.items.map((item) => {
              // Prefix matching, so a record page under /audit keeps the
              // section lit rather than dropping the user's sense of place.
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`)

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'on-chrome flex min-h-9 items-center gap-2.5 rounded-xs px-3 py-1.5 text-base transition-colors',
                      active
                        ? // The active entry is marked three ways — surface,
                          // weight, and a brass edge on the inline-start —
                          // because on the navy chrome a background change
                          // alone is nearly invisible on a bad monitor.
                          'border-s-2 border-brass-400 bg-chrome-active ps-2.5 font-semibold text-chrome-text'
                        : 'text-chrome-muted hover:bg-chrome-hover hover:text-chrome-text',
                    )}
                  >
                    <Icon as={NAV_ICONS[item.icon]} size="sm" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}
