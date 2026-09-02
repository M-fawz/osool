import type { Role } from '@prisma/client'
import { db } from '@/lib/db'

/**
 * Who a notification goes to.
 *
 * Recipient resolution is kept away from the message bodies because it is the
 * part with rules on it. Three of them, and each one has a requirement behind
 * it rather than a preference:
 *
 *   · **`SYSTEM_ADMIN` never receives a case notification.** §4: "Administration
 *     is not access." A message naming an application and its firm *is* case
 *     data, and mailing it to the one role that is forbidden to open the file
 *     would route around the control rather than enforce it. Administrators are
 *     notified about accounts, which is their own domain, and nothing else.
 *
 *   · **A reviewer is never told about a file they examined.** REQ-REG-052. The
 *     queue already hides it; the mailbox must not put it back.
 *
 *   · **Only ACTIVE, unarchived accounts are addressed.** A suspended officer
 *     keeps their mailbox, and a register that carried on mailing them case
 *     movements after their access was withdrawn would be leaking exactly what
 *     the suspension took away.
 */

export interface Recipient {
  userId: string | null
  email: string
  name: string
  nameAr: string | null
  role: Role | null
}

/** A role that must never be sent case data, whatever the event says. */
const NEVER_CASE_DATA: Role[] = ['SYSTEM_ADMIN']

function toRecipient(user: {
  id: string
  email: string
  name: string
  nameAr: string | null
  role: Role
}): Recipient {
  return { userId: user.id, email: user.email, name: user.name, nameAr: user.nameAr, role: user.role }
}

/**
 * Every officer holding one of these roles, right now.
 *
 * Used for the events that belong to a *post* rather than to a person — a newly
 * submitted application waiting at intake belongs to whoever is on the counter,
 * and the register does not know which clerk that is. Bounded by role, so this
 * is a handful of addresses and not a mailing list.
 */
export async function officersHolding(
  roles: Role[],
  options: { excludeUserId?: string | null } = {},
): Promise<Recipient[]> {
  const permitted = roles.filter((role) => !NEVER_CASE_DATA.includes(role))
  if (permitted.length === 0) return []

  const users = await db.user.findMany({
    where: {
      role: { in: permitted },
      status: 'ACTIVE',
      archivedAt: null,
      ...(options.excludeUserId ? { id: { not: options.excludeUserId } } : {}),
    },
    select: { id: true, email: true, name: true, nameAr: true, role: true },
    orderBy: { createdAt: 'asc' },
  })

  return users.map(toRecipient)
}

/** One named officer — the assigned examiner, the reviewer who decided. */
export async function officer(userId: string | null): Promise<Recipient[]> {
  if (!userId) return []

  const user = await db.user.findFirst({
    where: { id: userId, status: 'ACTIVE', archivedAt: null },
    select: { id: true, email: true, name: true, nameAr: true, role: true },
  })

  if (!user || NEVER_CASE_DATA.includes(user.role)) return []
  return [toRecipient(user)]
}

/**
 * The people at a firm who should hear about its own file.
 *
 * The owner and any authorised agent — the two capacities that can act on an
 * application. `BROKER_STAFF` do delegated data entry and are deliberately not
 * copied on decisions: a rejection is the firm's business, and widening it to
 * every data-entry account at the firm is a disclosure nobody asked for.
 */
export async function brokerContacts(brokerEntityId: string | null): Promise<Recipient[]> {
  if (!brokerEntityId) return []

  const users = await db.user.findMany({
    where: {
      brokerEntityId,
      role: { in: ['BROKER_OWNER', 'BROKER_AGENT'] },
      status: 'ACTIVE',
      archivedAt: null,
    },
    select: { id: true, email: true, name: true, nameAr: true, role: true },
    orderBy: { role: 'asc' },
  })

  return users.map(toRecipient)
}

/** One named account, whatever its role — used for account notifications. */
export async function account(userId: string): Promise<Recipient[]> {
  const user = await db.user.findFirst({
    where: { id: userId, archivedAt: null },
    select: { id: true, email: true, name: true, nameAr: true, role: true },
  })
  return user ? [toRecipient(user)] : []
}

/** Drop duplicates, so one person copied twice is mailed once. */
export function unique(recipients: Recipient[]): Recipient[] {
  const seen = new Set<string>()
  return recipients.filter((r) => {
    const key = r.userId ?? r.email.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
