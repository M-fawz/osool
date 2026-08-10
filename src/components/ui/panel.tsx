import * as React from 'react'
import { cn } from '@/lib/cn'
import { Icon } from './icon'
import type { IconSize, LucideIcon } from './icon'

/**
 * Page furniture.
 *
 * One level of surface, never two — 03-DESIGN-DIRECTION §3 names "cards inside
 * cards inside cards" as the tell. There is no nested variant of `Panel` on
 * purpose, and a table goes directly inside one rather than inside a card
 * inside one.
 */

/**
 * The page header.
 *
 * The brass rule beneath it echoes the abacus of the column capital in the
 * logo. It is the one ornamental gesture in the system, and it is a horizontal
 * line — which is the whole point: structure carries the design.
 */
export function PageHeader({
  title,
  lead,
  actions,
  meta,
  className,
}: {
  title: string
  lead?: string
  /** Controls. Kept to the end of the line, never competing with the title. */
  actions?: React.ReactNode
  /** A status or count that qualifies the title, sitting directly under it. */
  meta?: React.ReactNode
  className?: string
}) {
  return (
    <header className={cn('brass-rule mb-6 pb-4', className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-navy-700">{title}</h1>
          {lead ? (
            /* Held to a reading measure. A one-line description stretched
               across a 1500px register screen is a line nobody finishes. */
            <p className="mt-1.5 max-w-reading text-base text-ink-muted">{lead}</p>
          ) : null}
          {meta ? <div className="mt-2.5 flex flex-wrap items-center gap-2">{meta}</div> : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </header>
  )
}

/**
 * One level of surface.
 *
 * `flush` exists for the case that matters most here: a table fills its panel
 * edge to edge, because a table already has its own internal padding and
 * wrapping it in another 16px is the nested-card tell in a different costume.
 */
export function Panel({
  title,
  description,
  icon,
  actions,
  children,
  footer,
  flush = false,
  className,
  bodyClassName,
}: {
  title?: string
  description?: string
  icon?: LucideIcon
  actions?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  flush?: boolean
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn('border border-rule bg-paper', className)}>
      {title ? (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-rule px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            {icon ? <Icon as={icon} size="sm" className="text-brass-600" /> : null}
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-navy-700">{title}</h2>
              {description ? (
                <p className="mt-0.5 text-xs text-ink-muted">{description}</p>
              ) : null}
            </div>
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}

      <div className={cn(flush ? '' : 'p-4', bodyClassName)}>{children}</div>

      {footer ? (
        <div className="border-t border-rule bg-paper-raised px-4 py-3 text-sm text-ink-muted">
          {footer}
        </div>
      ) : null}
    </section>
  )
}

/**
 * A strip of controls above a table: filters, a search box, a count, an
 * action. Sits inside a flush panel, above the data, separated by a rule.
 */
export function Toolbar({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-rule px-4 py-2.5',
        className,
      )}
    >
      {children}
    </div>
  )
}

/**
 * A record's fields, as a register sets them out: the label above, the value
 * below, in aligned columns.
 *
 * A description list rather than a table, because these are one entity's
 * attributes and not rows of comparable things — and because it collapses to a
 * single column on a phone without any of a table's difficulty.
 */
export function KeyValue({
  children,
  columns = 2,
  className,
}: {
  children: React.ReactNode
  columns?: 1 | 2 | 3
  className?: string
}) {
  const cols =
    columns === 1 ? '' : columns === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3'

  return <dl className={cn('grid grid-cols-1 gap-x-6 gap-y-4', cols, className)}>{children}</dl>
}

export function KeyValueItem({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-2xs font-semibold uppercase tracking-wider text-ink-faint">{label}</dt>
      <dd className="m-0 mt-1 text-base text-ink">{children}</dd>
    </div>
  )
}

/**
 * Nothing here — but say which nothing.
 *
 * Three different situations look identical if they are all rendered as the
 * word "empty": a queue that is genuinely clear, a filter that matched
 * nothing, and a screen whose feature has not been built yet. Each needs a
 * different sentence and a different next action, so the component requires
 * them rather than defaulting.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  size = 'default',
  className,
}: {
  icon: LucideIcon
  title: string
  description: string
  action?: React.ReactNode
  size?: 'default' | 'sm'
  className?: string
}) {
  const iconSize: IconSize = size === 'sm' ? 'md' : 'lg'

  return (
    <div
      className={cn(
        'flex flex-col items-center text-center',
        size === 'sm' ? 'gap-2 px-4 py-8' : 'gap-3 px-6 py-14',
        className,
      )}
    >
      <span
        className={cn(
          'flex items-center justify-center border border-rule bg-paper-sunk text-ink-faint',
          size === 'sm' ? 'h-9 w-9' : 'h-14 w-14',
        )}
      >
        <Icon as={icon} size={iconSize} />
      </span>
      <p className={cn('font-semibold text-navy-700', size === 'sm' ? 'text-base' : 'text-lg')}>
        {title}
      </p>
      <p className="max-w-md text-sm text-ink-muted">{description}</p>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  )
}
