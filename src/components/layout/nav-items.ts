import type { Role } from '@prisma/client'
import { canProvisionAccounts, canSeeCaseData } from '@/lib/auth/roles'
import { ArchiveX, ClipboardList, LayoutGrid, ScrollText, ShieldCheck, Users } from '@/components/ui/icon'
import type { LucideIcon } from '@/components/ui/icon'

/**
 * The back-office navigation, derived from the role.
 *
 * Two things this deliberately does not do.
 *
 * It does not list routes that do not exist yet. A sidebar full of greyed-out
 * Phase 2 entries tells an official the system is unfinished every time they
 * look at it, and tells a demo audience the opposite of what is true.
 *
 * And it is not the authorisation check. Hiding a link the user cannot follow
 * is a courtesy — it saves them a refusal they could not have predicted — but
 * the guard on the page is what actually stops them, and it runs on the
 * server whether or not the link was ever rendered. CLAUDE.md rule 1: a rule
 * that is not enforced server-side does not exist.
 *
 * Icons travel as keys rather than as components, because this crosses the
 * server/client boundary and a React component is not serialisable.
 */

export type NavIconKey = 'dashboard' | 'audit' | 'accounts' | 'queue' | 'card' | 'archive'

export const NAV_ICONS: Record<NavIconKey, LucideIcon> = {
  dashboard: LayoutGrid,
  audit: ScrollText,
  accounts: Users,
  queue: ClipboardList,
  card: ShieldCheck,
  archive: ArchiveX,
}

export interface NavItem {
  href: string
  /** Key in the `nav` message namespace. */
  labelKey: string
  icon: NavIconKey
}

export interface NavSection {
  /** Key in the `nav` namespace, or null for the unlabelled first group. */
  headingKey: string | null
  items: NavItem[]
}

/**
 * The one screen each government role starts its day on. REQ-REG-050.
 *
 * A role's queue is its landing screen, so it is the first thing in the sidebar
 * under the dashboard rather than buried in a section. Roles with no Phase 1
 * step — the AML supervisor, the inspector, the analyst — have no entry, which
 * is honest: their screens arrive in Phases 3, 4, and 5.
 */
const WORKFLOW_QUEUES: Partial<Record<Role, { href: string; labelKey: string; icon: NavIconKey }>> = {
  REGISTRY_CLERK: { href: '/intake', labelKey: 'intake', icon: 'queue' },
  EXAMINER: { href: '/examination', labelKey: 'examination', icon: 'queue' },
  REVIEWER: { href: '/review', labelKey: 'review', icon: 'queue' },
  CARD_ISSUER: { href: '/issuance', labelKey: 'issuance', icon: 'card' },
  DATA_MANAGER: { href: '/records', labelKey: 'records', icon: 'queue' },
  FILES_HEAD: { href: '/archive', labelKey: 'archive', icon: 'archive' },
}

export function navSectionsFor(role: Role): NavSection[] {
  const sections: NavSection[] = [
    {
      headingKey: null,
      items: [{ href: '/dashboard', labelKey: 'dashboard', icon: 'dashboard' }],
    },
  ]

  const queue = WORKFLOW_QUEUES[role]
  if (queue) {
    sections.push({ headingKey: 'sectionWorkflow', items: [queue] })
  }

  if (canSeeCaseData(role)) {
    sections.push({
      headingKey: 'sectionSupervision',
      items: [{ href: '/audit', labelKey: 'auditTrail', icon: 'audit' }],
    })
  }

  if (canProvisionAccounts(role)) {
    sections.push({
      headingKey: 'sectionAdministration',
      items: [{ href: '/admin/users', labelKey: 'accounts', icon: 'accounts' }],
    })
  }

  return sections
}

/** The resolved, translated shape the navigation components render. */
export interface ResolvedNavSection {
  heading: string | null
  items: Array<{ href: string; label: string; icon: NavIconKey }>
}
