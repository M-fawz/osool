'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/cn'
import { Icon, Menu, X } from '@/components/ui/icon'
import { SidebarNav } from './sidebar-nav'
import type { ResolvedNavSection } from './nav-items'

/**
 * The navigation on a narrow screen.
 *
 * Below `lg` the sidebar would eat half the width, so it becomes a panel that
 * opens from the inline-start edge — the same edge it occupies on a desktop,
 * which means it slides in from the right in Arabic and the left in English
 * without a second implementation.
 *
 * Escape closes it, the background scroll is locked while it is open, and the
 * trigger reports its own state. None of that is decoration: this is the only
 * way to reach another screen on a phone.
 */
export function MobileNav({
  sections,
  label,
  closeLabel,
  footer,
}: {
  sections: ResolvedNavSection[]
  label: string
  closeLabel: string
  footer?: React.ReactNode
}) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-label={label}
        className="on-chrome flex h-9 w-9 items-center justify-center rounded-xs border border-chrome-rule text-chrome-muted hover:bg-chrome-hover hover:text-chrome-text lg:hidden"
      >
        <Icon as={Menu} size="sm" />
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label={closeLabel}
            onClick={() => setOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-navy-900/50"
          />

          <div
            className={cn(
              'on-chrome absolute inset-y-0 flex w-[17rem] max-w-[85vw] flex-col bg-chrome-deep',
              'border-e border-chrome-rule',
            )}
            // Logical, so the panel enters from the right in Arabic and the
            // left in English — the same edge the desktop sidebar occupies.
            style={{ insetInlineStart: 0 }}
          >
            <div className="flex items-center justify-between border-b border-chrome-rule px-3 py-2.5">
              <span className="text-sm font-semibold text-chrome-text">{label}</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={closeLabel}
                className="on-chrome flex h-9 w-9 items-center justify-center rounded-xs text-chrome-muted hover:bg-chrome-hover hover:text-chrome-text"
              >
                <Icon as={X} size="sm" />
              </button>
            </div>

            <nav aria-label={label} className="flex-1 overflow-y-auto p-3">
              <SidebarNav sections={sections} onNavigate={() => setOpen(false)} />
            </nav>

            {footer ? <div className="border-t border-chrome-rule p-3">{footer}</div> : null}
          </div>
        </div>
      ) : null}
    </>
  )
}
