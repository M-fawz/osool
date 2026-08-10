import { cn } from '@/lib/cn'

/**
 * Loading placeholders.
 *
 * These mirror the shape of what is coming — a page header, then a table with
 * this many columns — rather than showing a spinner in the middle of an empty
 * screen. The reason is not polish: on a slow ministry connection the skeleton
 * is on screen for several seconds, and a layout that matches the eventual
 * content does not jump when it arrives.
 *
 * No pulsing. 03-DESIGN-DIRECTION §3 lists the pulsing "AI is thinking" dot
 * among the tells, and a register that appears to breathe is not what this
 * product is. A flat, slightly darker block reads as "not yet" perfectly well.
 */

export function Skeleton({ className }: { className?: string }) {
  return <span className={cn('block rounded-xs bg-rule/70', className)} />
}

export function SkeletonText({
  lines = 1,
  className,
}: {
  lines?: number
  className?: string
}) {
  return (
    <span className={cn('block space-y-1.5', className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          className={cn('h-3.5', i === lines - 1 && lines > 1 ? 'w-3/5' : 'w-full')}
        />
      ))}
    </span>
  )
}

/** A page header's shape: title, lead, and the brass rule that is really there. */
export function SkeletonPageHeader() {
  return (
    <div className="brass-rule mb-6 pb-4">
      <Skeleton className="h-6 w-56" />
      <Skeleton className="mt-2.5 h-4 w-full max-w-reading" />
    </div>
  )
}

/** A table's shape, at the density the real one will have. */
export function SkeletonTable({ rows = 8, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="data-scroll" aria-hidden="true">
      <table className="w-full min-w-[52rem] border-collapse">
        <thead>
          <tr>
            {Array.from({ length: columns }, (_, i) => (
              <th key={i} className="border-b border-rule-strong bg-paper-sunk px-3 py-2.5">
                <Skeleton className="h-3 w-20" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, r) => (
            <tr key={r}>
              {Array.from({ length: columns }, (_, c) => (
                <td key={c} className="border-b border-rule px-3 py-3">
                  <Skeleton className={cn('h-3.5', c === 0 ? 'w-10' : c % 3 === 0 ? 'w-2/3' : 'w-4/5')} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * The accessible half of a loading state.
 *
 * The skeletons above are `aria-hidden` shapes; this is what is actually
 * announced. Without it a screen-reader user hears silence between pressing a
 * link and the page arriving.
 */
export function LoadingAnnouncement({ label }: { label: string }) {
  return (
    <p role="status" aria-live="polite" className="sr-only">
      {label}
    </p>
  )
}
