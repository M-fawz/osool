import {
  AlertTriangle,
  ArchiveX,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleSlash,
  ClipboardList,
  FileSearch,
  Info,
  LayoutGrid,
  Link2,
  Loader2,
  LogOut,
  Menu,
  Minus,
  ScrollText,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

/**
 * The icon set.
 *
 * Everything here is drawn, from one library, at one stroke weight. The
 * previous version of this system used Unicode characters — `✓`, `✕`, `!` —
 * with a comment claiming they survived printing and screen readers better
 * than an icon would. Neither claim held: they were rendered `aria-hidden`, so
 * no screen reader ever saw them, and inline SVG prints perfectly well. What
 * they actually did was inherit whichever fallback font the machine happened
 * to have, which is why the check mark and the cross were different weights.
 *
 * Meaning is still never carried by the icon alone — 03-DESIGN-DIRECTION §7.
 * Every status pairs one of these with a text label, and the icon is marked
 * decorative because the label is the accessible name.
 *
 * Size is fixed to the text it sits beside rather than passed in freely, so a
 * row of statuses cannot drift out of alignment.
 */

const SIZES = {
  /** Beside 11–13px meta text. */
  xs: 'h-3.5 w-3.5',
  /** The default: beside body text and in buttons. */
  sm: 'h-4 w-4',
  /** Section headings and the notice rail. */
  md: 'h-5 w-5',
  /** Empty states, and nothing else. */
  lg: 'h-8 w-8',
} as const

export type IconSize = keyof typeof SIZES

export function Icon({
  as: Glyph,
  size = 'sm',
  className,
  title,
}: {
  as: LucideIcon
  size?: IconSize
  className?: string
  /**
   * Only pass this when the icon is the *only* carrier of its meaning, which
   * in this system should be almost never. Without it the icon is decorative
   * and hidden, because the label beside it is the accessible name.
   */
  title?: string
}) {
  return (
    <Glyph
      className={cn('shrink-0', SIZES[size], className)}
      strokeWidth={2}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      aria-label={title}
    />
  )
}

export {
  AlertTriangle,
  ArchiveX,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleSlash,
  ClipboardList,
  FileSearch,
  Info,
  LayoutGrid,
  Link2,
  Loader2,
  LogOut,
  Menu,
  Minus,
  ScrollText,
  ShieldCheck,
  Users,
  X,
}
export type { LucideIcon }

/**
 * The chevron that points *forward* in the reading direction.
 *
 * 03-DESIGN-DIRECTION §5 lists directional icons among the things that must
 * mirror. A hard-coded `ChevronRight` means "next" in English and "previous"
 * in Arabic, which is the kind of error nobody catches until an official
 * clicks it. Resolving it from the locale in one place means no call site has
 * to remember.
 */
export function forwardChevron(locale: string): LucideIcon {
  return locale === 'ar' ? ChevronLeft : ChevronRight
}

export function forwardArrow(locale: string): LucideIcon {
  return locale === 'ar' ? ArrowLeft : ArrowRight
}
