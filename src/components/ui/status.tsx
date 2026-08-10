import * as React from 'react'
import { cn } from '@/lib/cn'
import { Icon, AlertTriangle, Check, CircleSlash, Info, Minus } from './icon'
import type { LucideIcon } from './icon'

/**
 * A status, never carried by colour alone.
 *
 * 03-DESIGN-DIRECTION §7: "Never encode meaning in colour alone. Every status
 * carries an icon and a text label. These decisions have legal consequences;
 * a colour-blind examiner must read them correctly."
 *
 * So each tone is three redundant signals — icon shape, colour, and the word
 * itself. Remove any two and it still reads. `data-status` is what keeps the
 * colour through a printout; see the print block in globals.css.
 */

const TONES: Record<string, { className: string; icon: LucideIcon }> = {
  confirmed: {
    className: 'border-confirmed/30 bg-confirmed-soft text-confirmed',
    icon: Check,
  },
  caution: {
    className: 'border-caution/30 bg-caution-soft text-caution',
    icon: AlertTriangle,
  },
  blocking: {
    className: 'border-blocking/30 bg-blocking-soft text-blocking',
    icon: CircleSlash,
  },
  informational: {
    className: 'border-informational/30 bg-informational-soft text-informational',
    icon: Info,
  },
  neutral: {
    className: 'border-rule-strong bg-paper-sunk text-ink-muted',
    icon: Minus,
  },
}

export type StatusTone = keyof typeof TONES

export function Status({
  tone,
  children,
  size = 'default',
  className,
}: {
  tone: StatusTone
  children: React.ReactNode
  /** `sm` is for inside a dense table row; `default` everywhere else. */
  size?: 'default' | 'sm'
  className?: string
}) {
  const style = TONES[tone]!

  return (
    <span
      data-status={tone}
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-xs border font-medium',
        size === 'sm' ? 'px-1.5 py-px text-2xs' : 'px-2 py-0.5 text-xs',
        style.className,
        className,
      )}
    >
      <Icon as={style.icon} size="xs" className={size === 'sm' ? 'h-3 w-3' : undefined} />
      <span>{children}</span>
    </span>
  )
}

/**
 * A count beside a label — the number of cases in a queue, of events checked,
 * of documents outstanding.
 *
 * Tabular numerals and an LTR run, so a column of these aligns and so `1,204`
 * never renders as `204,1` inside an Arabic sentence.
 */
export function Count({ value, className }: { value: number; className?: string }) {
  return (
    <span
      className={cn(
        'ltr-run inline-flex min-w-6 items-center justify-center rounded-xs bg-navy-50 px-1.5 py-px text-2xs font-semibold text-navy-600',
        className,
      )}
    >
      {new Intl.NumberFormat('en-US').format(value)}
    </span>
  )
}
