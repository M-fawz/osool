import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'
import { cn } from '@/lib/cn'
import { Loader2 } from './icon'

/**
 * Buttons.
 *
 * Two sizes exist because two products do — 03-DESIGN-DIRECTION §8. `touch` is
 * the broker portal: 44px minimum, used one-handed on a phone. `default` and
 * `sm` are the back office, where an examiner works a queue and every row of
 * saved height is another case on screen.
 *
 * Logical properties throughout, so the whole set mirrors for English without
 * a second stylesheet.
 */

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xs font-medium',
    'transition-[background-color,border-color,color] duration-100',
    'focus-visible:outline-2 focus-visible:outline-offset-2',
    // A disabled control must still be readable — it is often the thing the
    // user is trying to understand. Half-opacity turns navy into a muddy grey
    // that fails contrast; a defined disabled surface does not.
    'disabled:pointer-events-none disabled:border-rule disabled:bg-paper-sunk disabled:text-ink-faint',
    'aria-disabled:pointer-events-none aria-disabled:border-rule aria-disabled:bg-paper-sunk aria-disabled:text-ink-faint',
  ].join(' '),
  {
    variants: {
      variant: {
        primary: 'border border-navy-600 bg-navy-600 text-white hover:border-navy-700 hover:bg-navy-700 active:bg-navy-800',
        secondary: 'border border-rule-strong bg-paper text-ink hover:border-navy-300 hover:bg-navy-50 active:bg-navy-100',
        ghost: 'border border-transparent text-navy-600 hover:bg-navy-50 active:bg-navy-100',
        danger: 'border border-blocking bg-blocking text-white hover:brightness-95 active:brightness-90',
        /* On the navy chrome. Bordered rather than filled, so the chrome stays
           one flat surface and the control still reads as pressable. */
        chrome: 'on-chrome border border-chrome-rule bg-transparent text-chrome-muted hover:border-chrome-active hover:bg-chrome-hover hover:text-chrome-text',
      },
      size: {
        touch: 'min-h-11 px-5 text-md',
        default: 'min-h-9 px-3.5 text-base',
        sm: 'min-h-8 px-2.5 text-sm',
        /* A square target for a lone icon. Never used without an aria-label. */
        icon: 'h-9 w-9 p-0',
      },
    },
    defaultVariants: { variant: 'primary', size: 'default' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  /**
   * Shows a spinner and blocks the control.
   *
   * The label is kept visible rather than swapped for the word "loading",
   * because a button whose text changes width makes the row reflow under the
   * pointer, and because the user still needs to know what they pressed.
   */
  busy?: boolean
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  busy = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  // Slot forwards its props onto exactly one child element, so when `asChild`
  // is set the children have to be passed through untouched — even wrapping
  // them in a fragment alongside a `null` makes it an array of two and Slot
  // throws. A link styled as a button has no busy state anyway: it navigates.
  if (asChild) {
    return (
      <Slot
        className={cn(buttonVariants({ variant, size }), className)}
        aria-disabled={disabled || busy ? true : undefined}
        {...props}
      >
        {children}
      </Slot>
    )
  }

  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...props}
    >
      {busy ? <Spinner /> : null}
      {children}
    </button>
  )
}

/**
 * The busy indicator.
 *
 * `data-spinner` exempts it from the global reduced-motion override. A
 * stopped spinner is not a calmer spinner, it is a broken one — the whole
 * point of the element is to say that something is still happening.
 */
export function Spinner({ className }: { className?: string }) {
  return (
    <Loader2
      data-spinner=""
      aria-hidden="true"
      strokeWidth={2}
      className={cn('h-4 w-4 shrink-0 animate-spin', className)}
    />
  )
}

export { buttonVariants }
