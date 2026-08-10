import { cn } from '@/lib/cn'
import { Icon, Info } from '@/components/ui/icon'

/**
 * "لماذا نطلب هذا؟" — the rule behind a field, in one sentence.
 *
 * A government form that asks for a tax office number without saying why reads
 * as bureaucracy for its own sake, and the person filling it in either guesses
 * or gives up. One sentence naming the actual reason turns the same field into
 * something a person can answer with confidence — and it is the cheapest trust
 * the register will ever buy.
 *
 * A native `<details>`, not a tooltip and not a modal. It works before
 * JavaScript loads, it works on a phone where there is no hover, it is
 * keyboard-operable without any code, and a screen reader announces it as the
 * disclosure it is. The one thing it must not do is hide information the user
 * needs *in order to* fill the field in: this is the reason, never the format.
 */
export function WhyWeAsk({
  label,
  children,
  className,
}: {
  /** The translated "Why is this asked for?" label. */
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <details className={cn('group', className)}>
      <summary
        className={cn(
          'inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-xs',
          'text-sm font-medium text-navy-600 hover:underline',
          // Safari still draws its own disclosure triangle without this.
          '[&::-webkit-details-marker]:hidden',
        )}
      >
        <Icon as={Info} size="xs" />
        <span>{label}</span>
      </summary>
      <p className="mb-1 border-s-2 border-brass-300 bg-paper-sunk px-3 py-2 text-sm leading-relaxed text-ink-muted">
        {children}
      </p>
    </details>
  )
}
