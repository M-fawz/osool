import type { Role } from '@prisma/client'
import { canProvisionAccounts, canSeeCaseData } from '@/lib/auth/roles'
import {
  ArchiveX,
  ClipboardList,
  FileSearch,
  LayoutGrid,
  ScrollText,
  ShieldCheck,
  Users,
} from '@/components/ui/icon'
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

export type NavIconKey =
  | 'dashboard'
  | 'audit'
  | 'accounts'
  | 'queue'
  | 'card'
  | 'archive'
  | 'register'
  | 'signals'
  | 'appointments'

export const NAV_ICONS: Record<NavIconKey, LucideIcon> = {
  dashboard: LayoutGrid,
  audit: ScrollText,
  accounts: Users,
  queue: ClipboardList,
  card: ShieldCheck,
  archive: ArchiveX,
  register: FileSearch,
  signals: ShieldCheck,
  appointments: ClipboardList,
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

/** The posts that stand at a counter, and the one that plans it. */
const COUNTER_ROLES: Role[] = ['REGISTRY_CLERK', 'CARD_ISSUER', 'DATA_MANAGER', 'AUDITOR']

/** §4's supervisory functions. Signals are triaged here and nowhere else. */
const SUPERVISORY_ROLES: Role[] = ['AML_SUPERVISOR', 'AUDITOR', 'ANALYST']

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

  /*
   * The register itself.
   *
   * Every role that may see case data may look the register up: an examiner
   * checking whether an applicant already holds a registration, a card issuer
   * confirming a number, an inspector finding a firm. It sits in its own
   * section above supervision because it is a reference, not a worklist.
   */
  if (canSeeCaseData(role)) {
    sections.push({
      headingKey: 'sectionRegister',
      items: [{ href: '/register', labelKey: 'register', icon: 'register' }],
    })
  }

  /*
   * The counter's diary, for the two posts that stand at it and the data
   * manager who plans it. An examiner has no counter, so no entry.
   */
  if (COUNTER_ROLES.includes(role)) {
    sections.push({
      headingKey: 'sectionCounter',
      items: [{ href: '/appointments', labelKey: 'appointments', icon: 'appointments' }],
    })
  }

  if (canSeeCaseData(role)) {
    const supervision: NavItem[] = []

    // §4 gives the supervisory function to these three and no others. An
    // examiner does not triage signals about examiners.
    if (SUPERVISORY_ROLES.includes(role)) {
      supervision.push({ href: '/supervision', labelKey: 'signals', icon: 'signals' })
    }

    supervision.push({ href: '/audit', labelKey: 'auditTrail', icon: 'audit' })

    sections.push({ headingKey: 'sectionSupervision', items: supervision })
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
