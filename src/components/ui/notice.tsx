import * as React from 'react'
import { cn } from '@/lib/cn'
import { Icon, AlertTriangle, Check, CircleSlash, Info } from './icon'
import type { LucideIcon } from './icon'

/**
 * Notices and refusals.
 *
 * The shape here is deliberate. The obvious way to draw an alert — a card with
 * a four-pixel coloured stripe down one edge — is the single most recognisable
 * component on the generic web, and it makes a legal refusal look like a
 * dismissible toast. What this system draws instead is a *notice*: a titled
 * band across the top with the finding in it, a rule, and then the reasoning
 * set out beneath as a numbered form would set it out.
 *
 * That is not decoration. It is the same object the official already knows —
 * the notice pinned to a file — and it makes the four required parts read as a
 * record rather than as an error message.
 */

const TONES: Record<
  string,
  { band: string; frame: string; icon: LucideIcon; iconColor: string }
> = {
  blocking: {
    band: 'bg-blocking-soft border-blocking/30',
    frame: 'border-blocking/30',
    icon: CircleSlash,
    iconColor: 'text-blocking',
  },
  caution: {
    band: 'bg-caution-soft border-caution/30',
    frame: 'border-caution/30',
    icon: AlertTriangle,
    iconColor: 'text-caution',
  },
  informational: {
    band: 'bg-informational-soft border-informational/30',
    frame: 'border-informational/30',
    icon: Info,
    iconColor: 'text-informational',
  },
  confirmed: {
    band: 'bg-confirmed-soft border-confirmed/30',
    frame: 'border-confirmed/30',
    icon: Check,
    iconColor: 'text-confirmed',
  },
}

export type NoticeTone = keyof typeof TONES

/**
 * The four-part refusal. 03-DESIGN-DIRECTION §6.
 *
 * Every refusal in this system states, in this order: what is blocked · why,
 * naming the rule in plain language · the exact next step · who to ask. The
 * props are required rather than optional, so a bare "an error occurred"
 * cannot be rendered through this component — which is the point of it
 * existing at all.
 */
export function BlockedAction({
  what,
  why,
  nextStep,
  whoToAsk,
  legalSource,
  headings,
  tone = 'blocking',
  className,
}: {
  what: string
  why: string
  nextStep: string
  whoToAsk: string
  legalSource?: string
  headings: { what: string; why: string; next: string; who: string }
  tone?: 'blocking' | 'caution'
  className?: string
}) {
  const style = TONES[tone]!

  return (
    <section role="alert" className={cn('border bg-paper', style.frame, className)}>
      <div className={cn('flex items-start gap-2.5 border-b px-4 py-3', style.band)}>
        <Icon as={style.icon} size="md" className={cn('mt-px', style.iconColor)} />
        <div className="min-w-0">
          <p className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">
            {headings.what}
          </p>
          <p className="text-md font-semibold text-ink">{what}</p>
        </div>
      </div>

      {/* A description list, because that is what these three are: a term and
          its answer. It also means a screen reader announces "why" before the
          sentence that answers it, instead of four unlabelled paragraphs. */}
      <dl className="divide-y divide-rule">
        <NoticePart term={headings.why} className="px-4 py-3">
          <p className="text-base text-ink">{why}</p>
          {legalSource ? (
            <p className="mt-1.5 text-xs text-ink-faint">
              <bdi>{legalSource}</bdi>
            </p>
          ) : null}
        </NoticePart>

        <NoticePart term={headings.next} className="px-4 py-3">
          <p className="text-base text-ink">{nextStep}</p>
        </NoticePart>

        <NoticePart term={headings.who} className="px-4 py-3">
          <p className="text-base text-ink-muted">{whoToAsk}</p>
        </NoticePart>
      </dl>
    </section>
  )
}

function NoticePart({
  term,
  children,
  className,
}: {
  term: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <dt className="mb-0.5 text-2xs font-semibold uppercase tracking-wider text-ink-faint">
        {term}
      </dt>
      <dd className="m-0">{children}</dd>
    </div>
  )
}

/**
 * A single-sentence notice: a confirmation, a constraint worth restating, a
 * standing fact about the screen.
 *
 * Not a refusal. Anything that blocks an action goes through `BlockedAction`
 * so that it cannot be shipped without its four parts.
 */
export function Notice({
  tone = 'informational',
  title,
  children,
  className,
  live = false,
}: {
  tone?: NoticeTone
  title?: string
  children: React.ReactNode
  className?: string
  /** Announce this when it appears — for results of an action the user took. */
  live?: boolean
}) {
  const style = TONES[tone]!

  return (
    <div
      role={live ? 'status' : undefined}
      aria-live={live ? 'polite' : undefined}
      className={cn('flex items-start gap-2.5 border bg-paper px-3.5 py-3', style.frame, className)}
    >
      <Icon as={style.icon} size="sm" className={cn('mt-0.5', style.iconColor)} />
      <div className="min-w-0 flex-1 text-sm">
        {title ? <p className="font-semibold text-ink">{title}</p> : null}
        <div className={cn('text-ink-muted', title && 'mt-0.5')}>{children}</div>
      </div>
    </div>
  )
}
