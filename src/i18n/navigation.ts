import { createNavigation } from 'next-intl/navigation'
import { routing } from './routing'

/**
 * Locale-aware navigation primitives. Use these rather than next/link and
 * next/navigation directly, so the current locale is preserved across every
 * link — including, per 03-DESIGN-DIRECTION §5, on a filtered, paginated
 * table where switching language must not lose the filter.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing)
