import * as React from 'react'
import { cn } from '@/lib/cn'

/**
 * The dense table.
 *
 * In `operate` mode a table beats a card grid, so this is the default way to
 * show a list — and the back office is mostly this component. What makes it
 * usable at a hundred rows is not styling but three decisions:
 *
 *   · the header sticks, so an examiner scrolling a queue never loses the
 *     column names;
 *   · rows are banded, so the eye tracks across a wide row without a ruler;
 *   · long free text is clamped rather than allowed to set the row height,
 *     because one four-line reason turns every neighbouring row into
 *     whitespace and halves how much of the queue fits on screen.
 *
 * Column order mirrors automatically: the markup is logical and the direction
 * comes from `dir` on the document.
 */

export function Table({
  children,
  caption,
  density = 'default',
  layout = 'auto',
  minWidth = '52rem',
  className,
}: {
  children: React.ReactNode
  /**
   * Required in practice. It is the table's accessible name, and on a screen
   * with two tables a screen-reader user otherwise hears "table" twice.
   */
  caption?: React.ReactNode
  density?: 'default' | 'compact'
  /**
   * `fixed` makes the widths on the header cells authoritative.
   *
   * Under the default `auto` algorithm a `w-56` is only a suggestion: one long
   * unbreakable token in one row widens the column for the whole table, and an
   * eight-column register ends up 300px wider than the screen with the last
   * two columns permanently off the edge. Where the columns are known — which
   * is every table in this product — declaring them and meaning it is what
   * makes the layout predictable.
   */
  layout?: 'auto' | 'fixed'
  /**
   * The width below which the table scrolls rather than compresses. Squeezing
   * eight columns onto a phone produces columns too narrow to read a single
   * Arabic word in; scrolling is legible, and scrolling is what happens.
   */
  minWidth?: string
  className?: string
}) {
  return (
    <div className="data-scroll">
      <table
        data-density={density}
        style={{ minWidth }}
        className={cn(
          'data-table w-full border-collapse text-sm',
          layout === 'fixed' && 'table-fixed',
          className,
        )}
      >
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        {children}
      </table>
    </div>
  )
}

export function Th({
  children,
  className,
  numeric = false,
  scope = 'col',
}: {
  children?: React.ReactNode
  className?: string
  numeric?: boolean
  scope?: 'col' | 'row'
}) {
  return (
    <th
      scope={scope}
      className={cn(
        'border-b border-rule-strong px-3 py-2 text-2xs font-semibold uppercase tracking-wider text-ink-muted',
        // A numeric column heads the same way its figures sit, so the label
        // and the digits share an edge.
        numeric ? 'text-end' : 'text-start',
        className,
      )}
    >
      {children}
    </th>
  )
}

export function Td({
  children,
  className,
  colSpan,
  numeric = false,
  /**
   * Clamp free text to this many lines. Anything the user must be able to read
   * in full belongs on the record's own page, not in a queue row.
   */
  clamp,
}: {
  children?: React.ReactNode
  className?: string
  colSpan?: number
  numeric?: boolean
  clamp?: 1 | 2
}) {
  return (
    <td
      colSpan={colSpan}
      className={cn(
        'border-b border-rule px-3 py-2 align-top',
        numeric ? 'ltr-run text-end' : 'text-start',
        clamp === 1 && 'line-clamp-1',
        clamp === 2 && 'line-clamp-2',
        className,
      )}
    >
      {children}
    </td>
  )
}

/**
 * A whole-width row for the empty case, so the table keeps its header and its
 * shape instead of collapsing to nothing.
 */
export function TableEmptyRow({
  colSpan,
  children,
}: {
  colSpan: number
  children: React.ReactNode
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="border-b border-rule p-0">
        {children}
      </td>
    </tr>
  )
}

/**
 * The row count, stated plainly.
 *
 * "Showing 100 of 4,312" is the sentence a register needs, because the
 * difference between "there are a hundred" and "you are looking at the first
 * hundred" is the difference between a complete answer and a wrong one.
 */
export function TableCount({
  shown,
  total,
  label,
  className,
}: {
  shown: number
  total?: number
  /** Pre-formatted, translated sentence. */
  label: string
  className?: string
}) {
  return (
    <p className={cn('text-xs text-ink-muted', className)} aria-live="polite">
      {label}
      <span className="sr-only">
        {shown}
        {total ? ` / ${total}` : ''}
      </span>
    </p>
  )
}
